use std::collections::HashMap;
use std::sync::Mutex;

use tauri::utils::config::WindowConfig;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

/// 開くべきパスが届いたことをフロントへ知らせるイベント名
pub const PENDING_OPEN_EVENT: &str = "pending-open";

/// tauri.conf.json で定義しているウィンドウのラベル。
/// 文書ごとのウィンドウもこの設定を雛形にして作る。
pub const MAIN_WINDOW: &str = "main";

/// 文書用に追加するウィンドウのラベルにつける接頭辞。
/// capabilities/default.json の windows もこの形に合わせている。
const DOC_LABEL_PREFIX: &str = "doc-";

/// 新しいウィンドウを直前のウィンドウからずらす量（論理ピクセル）
const CASCADE_STEP: f64 = 28.0;

/// ウィンドウごとに「開くべきパス」と「表示中の文書」を持つ。
///
/// Finder から渡されたパスはフロントが起動しきる前に届くことがあるため、
/// いったんここへ預けてからウィンドウごとに取り出す。
#[derive(Default)]
pub struct OpenQueue(Mutex<HashMap<String, WindowSlot>>);

#[derive(Default)]
struct WindowSlot {
    /// フロントがまだ受け取っていないパス
    pending: Vec<String>,
    /// フロントが表示している文書のパス
    document: Option<String>,
    /// 開く文書が決まったか。
    /// 割り当て済み、またはフロントが起動時の受け取りを終えた状態を指す。
    claimed: bool,
}

impl OpenQueue {
    /// 指定ウィンドウで開くパスを預ける
    fn assign(&self, label: &str, path: String) {
        if let Ok(mut slots) = self.0.lock() {
            let slot = slots.entry(label.to_string()).or_default();
            slot.pending.push(path);
            slot.claimed = true;
        }
    }

    /// フロントが受け取る。取り出したぶんはキューから消える。
    pub fn take(&self, label: &str) -> Vec<String> {
        match self.0.lock() {
            Ok(mut slots) => {
                let slot = slots.entry(label.to_string()).or_default();
                slot.claimed = true;
                std::mem::take(&mut slot.pending)
            }
            Err(_) => Vec::new(),
        }
    }

    /// フロントが表示している文書を記録する
    pub fn set_document(&self, label: &str, path: Option<String>) {
        if let Ok(mut slots) = self.0.lock() {
            slots.entry(label.to_string()).or_default().document = path;
        }
    }

    /// 閉じられたウィンドウの記録を捨てる
    pub fn forget(&self, label: &str) {
        if let Ok(mut slots) = self.0.lock() {
            slots.remove(label);
        }
    }

    /// 指定パスを表示しているウィンドウのラベル
    fn showing(&self, path: &str) -> Option<String> {
        let slots = self.0.lock().ok()?;
        slots
            .iter()
            .find(|(_, slot)| slot.document.as_deref() == Some(path))
            .map(|(label, _)| label.clone())
    }

    /// まだ開く文書が決まっていないウィンドウ。
    /// 起動直後のメインウィンドウがこれにあたる。
    fn unclaimed(&self, labels: &[String]) -> Option<String> {
        let slots = self.0.lock().ok()?;
        labels
            .iter()
            .find(|label| slots.get(*label).is_none_or(|slot| !slot.claimed))
            .cloned()
    }
}

/// 起動引数や「このアプリケーションで開く」で渡されたパスを、開くべきウィンドウへ振り分ける。
///
/// 同じ文書のウィンドウがあればそれを前に出し、
/// 起動直後で行き先の決まっていないウィンドウがあればそこに開かせ、
/// どちらでもなければウィンドウを追加する。
pub fn dispatch<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>) {
    for path in paths {
        // フロントが記録するパスは正規化済みなので、突き合わせる前に形を揃える。
        // コマンドラインから相対パスで渡された場合もここで絶対パスになる。
        let path = crate::commands::canonicalize(std::path::Path::new(&path))
            .map(|resolved| resolved.to_string_lossy().to_string())
            .unwrap_or(path);

        let queue = app.state::<OpenQueue>();

        if let Some(label) = queue.showing(&path) {
            match app.get_webview_window(&label) {
                Some(window) => {
                    focus(&window);
                    continue;
                }
                // 記録が残ったまま閉じられていた場合。捨てて開き直す。
                None => queue.forget(&label),
            }
        }

        let labels: Vec<String> = app.webview_windows().into_keys().collect();

        // ファイルを指定して起動された場合、この通知はウィンドウが作られる前に届く。
        // これから出てくるメインウィンドウ宛に積んでおけば、
        // 起動しきったフロントが前回の続きではなくこのパスを開く。
        if labels.is_empty() {
            queue.assign(MAIN_WINDOW, path);
            continue;
        }

        if let Some(label) = queue.unclaimed(&labels) {
            queue.assign(&label, path);
            let _ = app.emit_to(label.as_str(), PENDING_OPEN_EVENT, ());
            if let Some(window) = app.get_webview_window(&label) {
                focus(&window);
            }
            continue;
        }

        if let Err(error) = open_document_window(app, path) {
            eprintln!("[window] {error}");
        }
    }
}

/// 文書を1つ表示するためのウィンドウを追加する
pub fn open_document_window<R: Runtime>(app: &AppHandle<R>, path: String) -> Result<(), String> {
    let mut config = main_window_config(app).ok_or("ウィンドウの設定が見つかりません")?;
    let label = next_label(app);

    // フロントは起動直後に take() を呼ぶため、ウィンドウを作る前に積んでおく
    app.state::<OpenQueue>().assign(&label, path);
    config.label = label;

    // 前のウィンドウの真上に重なると、増えたことが分からないのでずらす
    if let Some((x, y)) = cascade_from(app) {
        config.x = Some(x);
        config.y = Some(y);
        config.center = false;
    }

    let window = WebviewWindowBuilder::from_config(app, &config)
        .and_then(|builder| builder.build())
        .map_err(|error| format!("ウィンドウを作れませんでした: {error}"))?;

    let _ = window.set_focus();
    Ok(())
}

/// メインウィンドウを表示する。閉じられていた場合は設定から作り直す。
#[cfg(target_os = "macos")]
pub fn restore_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        focus(&window);
        return;
    }

    let Some(config) = main_window_config(app) else {
        return;
    };

    match WebviewWindowBuilder::from_config(app, &config).and_then(|builder| builder.build()) {
        Ok(window) => {
            let _ = window.set_focus();
        }
        Err(error) => eprintln!("[window] ウィンドウを作り直せませんでした: {error}"),
    }
}

/// いま前面にあるウィンドウ
pub fn focused<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.webview_windows()
        .into_values()
        .find(|window| window.is_focused().unwrap_or(false))
}

fn focus<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn main_window_config<R: Runtime>(app: &AppHandle<R>) -> Option<WindowConfig> {
    app.config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW)
        .cloned()
}

/// まだ使われていないウィンドウラベルを作る（閉じたぶんは再利用する）
fn next_label<R: Runtime>(app: &AppHandle<R>) -> String {
    let used = app.webview_windows();
    (1..)
        .map(|n| format!("{DOC_LABEL_PREFIX}{n}"))
        .find(|label| !used.contains_key(label))
        .expect("空きラベルは必ず見つかる")
}

/// 直前のウィンドウから少しずらした位置
fn cascade_from<R: Runtime>(app: &AppHandle<R>) -> Option<(f64, f64)> {
    let base = focused(app).or_else(|| app.webview_windows().into_values().next())?;
    let scale = base.scale_factor().ok()?;
    let position = base.outer_position().ok()?.to_logical::<f64>(scale);
    Some((position.x + CASCADE_STEP, position.y + CASCADE_STEP))
}

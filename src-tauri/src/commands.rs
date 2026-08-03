use base64::Engine;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, Runtime, State, WebviewWindow};

use crate::tree;
use crate::OpenQueue;

#[derive(Serialize)]
pub struct DocumentPayload {
    pub path: String,
    pub dir: String,
    pub name: String,
    pub content: String,
    pub size: u64,
    /// 最終更新時刻（UNIX ミリ秒）
    pub modified: Option<u64>,
}

/// パスを絶対形に直す。
///
/// Windows の `std::fs::canonicalize` は `\\?\C:\...` という装飾付きの形を返す。
/// 画面に出すと読みにくく、フロント側のパス判定とも噛み合わないため、
/// dunce を通して素直な `C:\...` に戻す。
pub fn canonicalize(path: &Path) -> std::io::Result<PathBuf> {
    #[cfg(windows)]
    {
        dunce::canonicalize(path)
    }
    #[cfg(not(windows))]
    {
        std::fs::canonicalize(path)
    }
}

fn resolve(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    canonicalize(&p).map_err(|e| format!("パスを解決できません ({path}): {e}"))
}

/// BOM を除去し、改行コードを LF に揃えたうえで文字列化する。
/// UTF-8 として不正なバイトが混ざっていても読めるように lossy 変換へフォールバックする。
fn decode_text(bytes: Vec<u8>) -> String {
    let without_bom = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        bytes[3..].to_vec()
    } else {
        bytes
    };

    let text = match String::from_utf8(without_bom) {
        Ok(s) => s,
        Err(e) => String::from_utf8_lossy(e.as_bytes()).into_owned(),
    };

    if text.contains('\r') {
        text.replace("\r\n", "\n").replace('\r', "\n")
    } else {
        text
    }
}

fn modified_ms(meta: &std::fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

/// asset プロトコルのスコープに指定ディレクトリを追加する。
/// これを通さないと、Markdown 内の相対パス画像が webview から読めない。
fn allow_dir<R: Runtime>(app: &AppHandle<R>, dir: &Path) {
    let _ = app.asset_protocol_scope().allow_directory(dir, true);
}

#[tauri::command]
pub fn scan_tree(root: String) -> Result<tree::TreeResult, String> {
    let path = resolve(&root)?;
    tree::scan(&path)
}

#[tauri::command]
pub fn read_document<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<DocumentPayload, String> {
    let p = resolve(&path)?;
    let meta = std::fs::metadata(&p).map_err(|e| format!("情報を取得できません: {e}"))?;

    if meta.is_dir() {
        return Err(format!("フォルダは開けません: {}", p.to_string_lossy()));
    }

    let bytes = std::fs::read(&p).map_err(|e| format!("読み込みに失敗しました: {e}"))?;
    let content = decode_text(bytes);

    let dir = p
        .parent()
        .map(|d| d.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("/"));
    allow_dir(&app, &dir);

    Ok(DocumentPayload {
        path: p.to_string_lossy().to_string(),
        dir: dir.to_string_lossy().to_string(),
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        content,
        size: meta.len(),
        modified: modified_ms(&meta),
    })
}

/// HTML 書き出しで画像をインライン化するために data URI を返す
#[tauri::command]
pub fn read_file_data_uri(path: String) -> Result<String, String> {
    let p = resolve(&path)?;
    let bytes = std::fs::read(&p).map_err(|e| format!("読み込みに失敗しました: {e}"))?;

    let mime = match p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    };

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("フォルダを作成できません: {e}"))?;
    }
    std::fs::write(&p, content).map_err(|e| format!("書き出しに失敗しました: {e}"))
}

/// WKWebView は window.print() を実装していないため、Rust 側から印刷を呼ぶ
#[tauri::command]
pub fn print_document<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    window
        .print()
        .map_err(|e| format!("印刷ダイアログを開けません: {e}"))
}

/// ファイルの置き場所を、その OS のファイル管理アプリで開く
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let p = resolve(&path)?;

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = std::process::Command::new("open");
        c.arg("-R").arg(&p);
        c
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = std::process::Command::new("explorer");
        // explorer は選択に成功しても終了コードが 1 になることがあるため、
        // 起動できたかどうかだけを見る
        c.arg(format!("/select,{}", p.display()));
        c
    };

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(p.parent().unwrap_or(&p));
        c
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("ファイルの場所を開けません: {e}"))
}

#[derive(Serialize)]
pub struct PathKind {
    pub exists: bool,
    pub is_dir: bool,
    pub is_markdown: bool,
    pub path: String,
}

#[tauri::command]
pub fn path_kind(path: String) -> PathKind {
    match canonicalize(&PathBuf::from(&path)) {
        Ok(p) => {
            let is_dir = p.is_dir();
            PathKind {
                exists: true,
                is_dir,
                is_markdown: !is_dir && tree::is_markdown(&p),
                path: p.to_string_lossy().to_string(),
            }
        }
        Err(_) => PathKind {
            exists: false,
            is_dir: false,
            is_markdown: false,
            path,
        },
    }
}

/// フォルダを開いた時点で、その配下の画像を asset プロトコル経由で読めるようにする
#[tauri::command]
pub fn allow_asset_dir<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let p = resolve(&path)?;
    let dir = if p.is_dir() {
        p
    } else {
        p.parent().map(|d| d.to_path_buf()).unwrap_or(p)
    };
    allow_dir(&app, &dir);
    Ok(())
}

/// 起動引数や「このアプリで開く」でこのウィンドウ宛に渡されたパスを取り出す
/// （取り出したらキューは空になる）
#[tauri::command]
pub fn take_pending_open<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, OpenQueue>,
) -> Vec<String> {
    state.take(window.label())
}

/// 指定したパスを新しいウィンドウで開く。
/// 複数のファイルをまとめて渡されたときに、2つ目以降を別のウィンドウへ回すために使う。
#[tauri::command]
pub fn open_in_new_window<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    crate::window::open_document_window(&app, path)
}

/// このウィンドウが表示している文書を記録する。
/// 同じファイルを Finder から開き直したときに、ウィンドウを増やさず前面に出すために使う。
#[tauri::command]
pub fn set_window_document<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, OpenQueue>,
    path: Option<String>,
) {
    state.set_document(window.label(), path);
}

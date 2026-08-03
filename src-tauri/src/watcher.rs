use notify::{event::ModifyKind, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime, State, WebviewWindow};

/// 変更が落ち着いたと判断するまでの待ち時間。
/// エディタは保存時に複数イベントを出すため、まとめてから通知する。
const DEBOUNCE: Duration = Duration::from_millis(250);

/// ウィンドウごとに 1 つの監視を持つ。
/// ウィンドウはそれぞれ別のフォルダを開けるため、まとめて 1 つにはできない。
#[derive(Default)]
pub struct WatcherState(pub Mutex<HashMap<String, Handle>>);

pub struct Handle {
    /// 監視を維持するために保持する（drop されると監視が止まる）
    _watcher: RecommendedWatcher,
    stop: Arc<AtomicBool>,
}

#[derive(Serialize, Clone)]
struct FsChange {
    /// 変更のあったパス
    paths: Vec<String>,
    /// ファイルの作成・削除・リネームが含まれるか（ツリーの再取得が必要）
    structural: bool,
}

/// 指定ウィンドウの監視を止める。ウィンドウを閉じたときの後始末にも使う。
pub fn stop_for(state: &WatcherState, label: &str) {
    if let Ok(mut watchers) = state.0.lock() {
        if let Some(handle) = watchers.remove(label) {
            handle.stop.store(true, Ordering::SeqCst);
        }
    }
}

#[tauri::command]
pub fn start_watch<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: State<'_, WatcherState>,
    root: String,
) -> Result<(), String> {
    let label = window.label().to_string();
    stop_for(state.inner(), &label);

    let path = PathBuf::from(&root);
    if !path.exists() {
        return Err(format!("監視できません（存在しないパス）: {root}"));
    }

    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher =
        notify::recommended_watcher(tx).map_err(|e| format!("監視を開始できません: {e}"))?;
    watcher
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|e| format!("監視を開始できません: {e}"))?;

    let stop = Arc::new(AtomicBool::new(false));
    let stop_signal = stop.clone();
    let target = label.clone();

    std::thread::spawn(move || {
        let mut pending: HashSet<String> = HashSet::new();
        let mut structural = false;
        let mut first_seen: Option<Instant> = None;

        loop {
            if stop_signal.load(Ordering::SeqCst) {
                break;
            }

            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Ok(event)) => {
                    if matches!(
                        event.kind,
                        EventKind::Create(_)
                            | EventKind::Remove(_)
                            | EventKind::Modify(ModifyKind::Name(_))
                    ) {
                        structural = true;
                    }
                    for p in event.paths {
                        pending.insert(p.to_string_lossy().to_string());
                    }
                    if first_seen.is_none() {
                        first_seen = Some(Instant::now());
                    }
                }
                Ok(Err(_)) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                // watcher が drop された＝監視終了
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            if let Some(started) = first_seen {
                if started.elapsed() >= DEBOUNCE && !pending.is_empty() {
                    let payload = FsChange {
                        paths: pending.drain().collect(),
                        structural,
                    };
                    // 監視を頼んだウィンドウにだけ返す
                    let _ = app.emit_to(target.as_str(), "fs-changed", payload);
                    structural = false;
                    first_seen = None;
                }
            }
        }
    });

    if let Ok(mut watchers) = state.0.lock() {
        watchers.insert(
            label,
            Handle {
                _watcher: watcher,
                stop,
            },
        );
    }

    Ok(())
}

#[tauri::command]
pub fn stop_watch<R: Runtime>(window: WebviewWindow<R>, state: State<'_, WatcherState>) {
    stop_for(state.inner(), window.label());
}

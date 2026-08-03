mod commands;
mod menu;
mod tree;
mod watcher;
mod window;

use tauri::Manager;

pub use window::OpenQueue;

pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Windows / Linux ではファイルを開くたびに新しいプロセスが立ち上がる。
    // 2 つ目以降の起動を最初のプロセスへ引き渡し、macOS の
    // 「このアプリケーションで開く」と同じ流れに合わせる。
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths: Vec<String> = argv
                .into_iter()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .collect();
            if !paths.is_empty() {
                window::dispatch(app, paths);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            // 位置とサイズを覚えるのはメインウィンドウだけにする。
            // 文書ごとのウィンドウは開くたびに増減するため、覚えても次に活きない。
            tauri_plugin_window_state::Builder::new()
                .with_filter(|label| label == window::MAIN_WINDOW)
                .build(),
        )
        .manage(window::OpenQueue::default())
        .manage(watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::scan_tree,
            commands::read_document,
            commands::read_file_data_uri,
            commands::write_text_file,
            commands::print_document,
            commands::reveal_path,
            commands::path_kind,
            commands::allow_asset_dir,
            commands::take_pending_open,
            commands::open_in_new_window,
            commands::set_window_document,
            watcher::start_watch,
            watcher::stop_watch,
        ])
        .setup(|app| {
            menu::init(app.handle())?;

            // コマンドラインから渡されたファイル / フォルダを拾う
            let args: Vec<String> = std::env::args()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .collect();
            if !args.is_empty() {
                window::dispatch(app.handle(), args);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // 閉じたウィンドウが握っていた監視と記録を片付ける
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let app = window.app_handle();
                app.state::<window::OpenQueue>().forget(window.label());
                watcher::stop_for(&app.state::<watcher::WatcherState>(), window.label());
            }
        })
        .build(tauri::generate_context!())
        .expect("Tauri アプリの初期化に失敗しました")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            match event {
                tauri::RunEvent::Opened { urls } => {
                    let paths: Vec<String> = urls
                        .iter()
                        .filter_map(|url| url.to_file_path().ok())
                        .map(|p| p.to_string_lossy().to_string())
                        .collect();

                    if !paths.is_empty() {
                        window::dispatch(app, paths);
                    }
                }

                // ウィンドウを閉じたあとに Dock アイコンを押されたら復帰させる。
                // これが無いと、閉じた時点でアプリを再起動するしかなくなる。
                tauri::RunEvent::Reopen {
                    has_visible_windows,
                    ..
                } => {
                    if !has_visible_windows {
                        window::restore_main(app);
                    }
                }

                _ => {}
            }

            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

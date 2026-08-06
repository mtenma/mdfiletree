use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

/// メニュー項目を押したときにフロントへ流すイベント名
pub const MENU_EVENT: &str = "menu-action";

/// メニュー項目を作る。
/// アクセラレータ文字列の解釈に失敗しても起動を止めないよう、失敗時はショートカット無しで作り直す。
/// （主要なショートカットはフロント側の keydown でも受けているため機能は失われない）
fn item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    text: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    match MenuItem::with_id(app, id, text, true, accelerator) {
        Ok(menu_item) => Ok(menu_item),
        Err(_) if accelerator.is_some() => {
            eprintln!("[menu] ショートカットを解釈できませんでした: {accelerator:?} ({id})");
            MenuItem::with_id(app, id, text, true, None::<&str>)
        }
        Err(e) => Err(e),
    }
}

/// ファイルの置き場所を開くアプリの呼び名
#[cfg(target_os = "windows")]
const REVEAL_LABEL: &str = "エクスプローラーで表示";
#[cfg(not(target_os = "windows"))]
const REVEAL_LABEL: &str = "Finder で表示";

/// アプリ名のメニュー（「MDFileTree について」など）は macOS だけの作法。
/// サービスや「ほかを隠す」も macOS 固有なので、まとめてここに閉じ込める。
#[cfg(target_os = "macos")]
fn app_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let settings = item(app, "open-settings", "設定…", Some("Cmd+Comma"))?;
    Submenu::with_items(
        app,
        "MDFileTree",
        true,
        &[
            &PredefinedMenuItem::about(
                app,
                Some("MDFileTree について"),
                Some(AboutMetadata::default()),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some("サービス"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("MDFileTree を隠す"))?,
            &PredefinedMenuItem::hide_others(app, Some("ほかを隠す"))?,
            &PredefinedMenuItem::show_all(app, Some("すべてを表示"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("MDFileTree を終了"))?,
        ],
    )
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    let app_menu = app_submenu(app)?;

    #[allow(unused_mut)]
    let mut file_items: Vec<Box<dyn tauri::menu::IsMenuItem<R>>> = vec![
        Box::new(item(
            app,
            "open-folder",
            "フォルダを開く…",
            Some("CmdOrCtrl+Shift+O"),
        )?),
        Box::new(item(app, "open-file", "ファイルを開く…", Some("CmdOrCtrl+O"))?),
        Box::new(PredefinedMenuItem::separator(app)?),
        Box::new(item(app, "reveal", REVEAL_LABEL, Some("CmdOrCtrl+Alt+R"))?),
        Box::new(PredefinedMenuItem::separator(app)?),
        Box::new(item(
            app,
            "export-html",
            "HTML として書き出す…",
            Some("CmdOrCtrl+E"),
        )?),
        Box::new(item(app, "print", "プリント…", Some("CmdOrCtrl+P"))?),
        Box::new(PredefinedMenuItem::separator(app)?),
        Box::new(PredefinedMenuItem::close_window(
            app,
            Some("ウィンドウを閉じる"),
        )?),
    ];

    // macOS 以外にはアプリ名のメニューがないので、設定と終了はファイルメニューに置く
    #[cfg(not(target_os = "macos"))]
    {
        file_items.push(Box::new(PredefinedMenuItem::separator(app)?));
        file_items.push(Box::new(item(
            app,
            "open-settings",
            "設定…",
            Some("CmdOrCtrl+Comma"),
        )?));
        file_items.push(Box::new(PredefinedMenuItem::separator(app)?));
        file_items.push(Box::new(PredefinedMenuItem::quit(app, Some("終了"))?));
    }

    let file_refs: Vec<&dyn tauri::menu::IsMenuItem<R>> =
        file_items.iter().map(|boxed| boxed.as_ref()).collect();
    let file_menu = Submenu::with_items(app, "ファイル", true, &file_refs)?;

    let edit_menu = Submenu::with_items(
        app,
        "編集",
        true,
        &[
            &PredefinedMenuItem::copy(app, Some("コピー"))?,
            &PredefinedMenuItem::select_all(app, Some("すべてを選択"))?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "find", "検索…", Some("CmdOrCtrl+F"))?,
            &item(app, "find-next", "次を検索", Some("CmdOrCtrl+G"))?,
            &item(app, "find-prev", "前を検索", Some("CmdOrCtrl+Shift+G"))?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "表示",
        true,
        &[
            &item(
                app,
                "toggle-tree",
                "フォルダツリーの表示切り替え",
                Some("CmdOrCtrl+Backslash"),
            )?,
            &item(
                app,
                "toggle-toc",
                "目次の表示切り替え",
                Some("CmdOrCtrl+Alt+Backslash"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "zoom-in", "拡大", Some("CmdOrCtrl+Equal"))?,
            &item(app, "zoom-out", "縮小", Some("CmdOrCtrl+Minus"))?,
            &item(app, "zoom-reset", "実際のサイズ", Some("CmdOrCtrl+0"))?,
            &PredefinedMenuItem::separator(app)?,
            &item(
                app,
                "toggle-theme",
                "ライト / ダークを切り替え",
                Some("CmdOrCtrl+Shift+L"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, Some("フルスクリーン"))?,
        ],
    )?;

    let go_menu = Submenu::with_items(
        app,
        "移動",
        true,
        &[
            &item(app, "go-back", "戻る", Some("CmdOrCtrl+BracketLeft"))?,
            &item(app, "go-forward", "進む", Some("CmdOrCtrl+BracketRight"))?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "ウインドウ",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("しまう"))?,
            &PredefinedMenuItem::maximize(app, Some("拡大／縮小"))?,
        ],
    )?;

    #[allow(unused_mut)]
    let mut submenus: Vec<&dyn tauri::menu::IsMenuItem<R>> = Vec::new();

    #[cfg(target_os = "macos")]
    submenus.push(&app_menu);

    submenus.extend([
        &file_menu as &dyn tauri::menu::IsMenuItem<R>,
        &edit_menu,
        &view_menu,
        &go_menu,
        &window_menu,
    ]);

    let menu = Menu::with_items(app, &submenus)?;

    app.set_menu(menu)?;

    // メニューはアプリ全体で 1 つなので、操作の宛先は前面のウィンドウに絞る。
    // 全ウィンドウへ流すと、見えていないウィンドウまで一緒に反応してしまう。
    app.on_menu_event(|app, event| {
        if let Some(window) = crate::window::focused(app) {
            let _ = app.emit_to(window.label(), MENU_EVENT, event.id().0.as_str());
        }
    });

    Ok(())
}

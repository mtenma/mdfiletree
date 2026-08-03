// リリースビルドで余計なコンソールウィンドウを出さない（Windows 向けだが無害）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mdfiletree_lib::run()
}

import { invoke } from '@tauri-apps/api/core'
import type { DocumentPayload, PathKind, TreeResult } from '../types'

export const scanTree = (root: string, includeHtml: boolean) =>
  invoke<TreeResult>('scan_tree', { root, includeHtml })

export const readDocument = (path: string) => invoke<DocumentPayload>('read_document', { path })

export const readFileDataUri = (path: string) => invoke<string>('read_file_data_uri', { path })

export const writeTextFile = (path: string, content: string) =>
  invoke<void>('write_text_file', { path, content })

/** WKWebView は window.print() を持たないため Rust 側から印刷する */
export const printDocument = () => invoke<void>('print_document')

/** ファイルの置き場所を OS のファイル管理アプリで開く */
export const revealPath = (path: string) => invoke<void>('reveal_path', { path })

export const pathKind = (path: string) => invoke<PathKind>('path_kind', { path })

export const allowAssetDir = (path: string) => invoke<void>('allow_asset_dir', { path })

export const takePendingOpen = () => invoke<string[]>('take_pending_open')

/** 指定パスを新しいウィンドウで開く */
export const openInNewWindow = (path: string) => invoke<void>('open_in_new_window', { path })

/** 表示中の文書を Rust 側へ伝える（同じファイルを二重のウィンドウで開かないために使う） */
export const setWindowDocument = (path: string | null) =>
  invoke<void>('set_window_document', { path })

export const startWatch = (root: string) => invoke<void>('start_watch', { root })

export const stopWatch = () => invoke<void>('stop_watch')

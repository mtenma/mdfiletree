import { accel } from '../lib/platform'
import type { ResolvedTheme } from '../types'

interface ToolbarProps {
  title: string
  path: string | null
  theme: ResolvedTheme
  treeVisible: boolean
  tocVisible: boolean
  canGoBack: boolean
  canGoForward: boolean
  hasDocument: boolean
  onBack: () => void
  onForward: () => void
  onOpenFolder: () => void
  onOpenFile: () => void
  onToggleTree: () => void
  onToggleToc: () => void
  onToggleTheme: () => void
  onFind: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onExport: () => void
  onPrint: () => void
  onOpenSettings: () => void
}

export function Toolbar({
  title,
  path,
  theme,
  treeVisible,
  tocVisible,
  canGoBack,
  canGoForward,
  hasDocument,
  onBack,
  onForward,
  onOpenFolder,
  onOpenFile,
  onToggleTree,
  onToggleToc,
  onToggleTheme,
  onFind,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onExport,
  onPrint,
  onOpenSettings,
}: ToolbarProps) {
  return (
    <header className="toolbar" data-tauri-drag-region>
      <button
        type="button"
        className="tool-button"
        title={`戻る (${accel('⌘[')})`}
        aria-label="戻る"
        disabled={!canGoBack}
        onClick={onBack}
      >
        ‹
      </button>
      <button
        type="button"
        className="tool-button"
        title={`進む (${accel('⌘]')})`}
        aria-label="進む"
        disabled={!canGoForward}
        onClick={onForward}
      >
        ›
      </button>

      <span className="tool-sep" />

      <button
        type="button"
        className="tool-button"
        title={`フォルダを開く (${accel('⇧⌘O')})`}
        aria-label="フォルダを開く"
        onClick={onOpenFolder}
      >
        📂
      </button>
      <button
        type="button"
        className="tool-button"
        title={`ファイルを開く (${accel('⌘O')})`}
        aria-label="ファイルを開く"
        onClick={onOpenFile}
      >
        📄
      </button>

      <div className="toolbar-title" data-tauri-drag-region>
        <span className="toolbar-name" data-tauri-drag-region>
          {title}
        </span>
        {path && (
          <span className="toolbar-path" data-tauri-drag-region title={path}>
            {path}
          </span>
        )}
      </div>

      <div className="toolbar-actions">
        <button
          type="button"
          className="tool-button"
          title={`フォルダツリー (${accel('⌘\\')})`}
          aria-label="フォルダツリーの表示切り替え"
          aria-pressed={treeVisible}
          onClick={onToggleTree}
        >
          ▤
        </button>
        <button
          type="button"
          className="tool-button"
          title={`目次 (${accel('⌘⌥\\')})`}
          aria-label="目次の表示切り替え"
          aria-pressed={tocVisible}
          onClick={onToggleToc}
        >
          ☰
        </button>

        <span className="tool-sep" />

        <button
          type="button"
          className="tool-button"
          title={`検索 (${accel('⌘F')})`}
          aria-label="文書内を検索"
          disabled={!hasDocument}
          onClick={onFind}
        >
          🔍
        </button>

        <span className="tool-sep" />

        <button
          type="button"
          className="tool-button"
          title={`縮小 (${accel('⌘-')})`}
          aria-label="文字を小さく"
          onClick={onZoomOut}
        >
          A－
        </button>
        <button
          type="button"
          className="tool-button"
          title={`実際のサイズ (${accel('⌘0')})`}
          aria-label="文字サイズを戻す"
          onClick={onZoomReset}
        >
          A
        </button>
        <button
          type="button"
          className="tool-button"
          title={`拡大 (${accel('⌘+')})`}
          aria-label="文字を大きく"
          onClick={onZoomIn}
        >
          A＋
        </button>

        <span className="tool-sep" />

        <button
          type="button"
          className="tool-button"
          title={`HTML として書き出す (${accel('⌘E')})`}
          aria-label="HTML として書き出す"
          disabled={!hasDocument}
          onClick={onExport}
        >
          ⤓
        </button>
        <button
          type="button"
          className="tool-button"
          title={`プリント (${accel('⌘P')})`}
          aria-label="プリント"
          disabled={!hasDocument}
          onClick={onPrint}
        >
          ⎙
        </button>

        <button
          type="button"
          className="tool-button"
          title={`ライト / ダーク (${accel('⌘⇧L')})`}
          aria-label="配色を切り替え"
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? '🌙' : '☀'}
        </button>
        <button
          type="button"
          className="tool-button"
          title={`設定 (${accel('⌘,')})`}
          aria-label="設定"
          onClick={onOpenSettings}
        >
          ⚙
        </button>
      </div>
    </header>
  )
}

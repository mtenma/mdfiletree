import { useEffect } from 'react'

interface SettingsModalProps {
  includeHtml: boolean
  onIncludeHtmlChange: (value: boolean) => void
  onClose: () => void
}

export function SettingsModal({ includeHtml, onIncludeHtmlChange, onClose }: SettingsModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="settings-overlay"
      onPointerDown={(event) => {
        // モーダルの外側を押したときだけ閉じる
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="設定">
        <div className="settings-head">
          <h2 className="settings-title">設定</h2>
          <button
            type="button"
            className="tool-button"
            title="閉じる (Esc)"
            aria-label="設定を閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <label className="settings-row">
          <input
            type="checkbox"
            checked={includeHtml}
            onChange={(event) => onIncludeHtmlChange(event.target.checked)}
          />
          <span>HTML ファイルを表示対象に含める</span>
        </label>
        <p className="settings-note">フォルダツリーに .html / .htm も表示します。</p>
      </div>
    </div>
  )
}

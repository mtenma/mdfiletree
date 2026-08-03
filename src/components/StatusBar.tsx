import { accel, FILE_MANAGER } from '../lib/platform'

interface StatusBarProps {
  path: string | null
  size: number | null
  modified: number | null
  headingCount: number
  message: string | null
  error: string | null
  onReveal: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatTime(ms: number): string {
  const date = new Date(ms)
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()

  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (sameDay) return time
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}`
}

export function StatusBar({
  path,
  size,
  modified,
  headingCount,
  message,
  error,
  onReveal,
}: StatusBarProps) {
  return (
    <footer className="statusbar">
      {path ? (
        <button
          type="button"
          className="tool-button"
          style={{ height: 20, padding: '0 6px', fontSize: 11.5 }}
          title={`${FILE_MANAGER} で表示 (${accel('⌘⌥R')})`}
          onClick={onReveal}
        >
          {path}
        </button>
      ) : (
        <span>ファイルが開かれていません</span>
      )}

      <span className="statusbar-spacer" />

      {error ? (
        <span className="statusbar-error">{error}</span>
      ) : (
        message && <span>{message}</span>
      )}

      {headingCount > 0 && <span>見出し {headingCount}</span>}
      {size !== null && <span>{formatSize(size)}</span>}
      {modified !== null && <span>更新 {formatTime(modified)}</span>}
    </footer>
  )
}

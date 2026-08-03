import { basename } from '../lib/paths'

interface WelcomeScreenProps {
  recentFolders: string[]
  recentFiles: string[]
  onOpenFolder: () => void
  onOpenFile: () => void
  onSelectFolder: (path: string) => void
  onSelectFile: (path: string) => void
}

export function WelcomeScreen({
  recentFolders,
  recentFiles,
  onOpenFolder,
  onOpenFile,
  onSelectFolder,
  onSelectFile,
}: WelcomeScreenProps) {
  return (
    <div className="welcome">
      <h1>MDFileTree</h1>
      <p>Markdown ファイルを読むためのビューアです。</p>

      <div className="welcome-actions">
        <button type="button" className="welcome-button" onClick={onOpenFolder}>
          フォルダを開く
        </button>
        <button type="button" className="welcome-button" onClick={onOpenFile}>
          ファイルを開く
        </button>
      </div>

      {recentFolders.length > 0 && (
        <div className="welcome-recent">
          <h2>最近使ったフォルダ</h2>
          <ul>
            {recentFolders.map((folder) => (
              <li key={folder}>
                <button type="button" title={folder} onClick={() => onSelectFolder(folder)}>
                  📁 {basename(folder)}
                  <span style={{ opacity: 0.55 }}> — {folder}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentFiles.length > 0 && (
        <div className="welcome-recent">
          <h2>最近開いたファイル</h2>
          <ul>
            {recentFiles.map((file) => (
              <li key={file}>
                <button type="button" title={file} onClick={() => onSelectFile(file)}>
                  📄 {basename(file)}
                  <span style={{ opacity: 0.55 }}> — {file}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="welcome-hint">
        ウィンドウにファイルやフォルダをドラッグしても開けます。
      </p>
    </div>
  )
}

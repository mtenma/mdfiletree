/**
 * 動作中の OS を見分ける。
 *
 * パスの区切りやショートカットの表記が OS で変わるため、
 * 判定をここ 1 か所に集めている。
 * webview の UA は macOS なら "Macintosh"、Windows なら "Windows NT" を含む。
 */
export const IS_WINDOWS = navigator.userAgent.includes('Windows')

export const IS_MAC = !IS_WINDOWS

/**
 * macOS 表記のショートカット（⇧⌘G など）を、その OS の書き方に直す。
 * macOS ではそのまま返す。Windows では Ctrl+Shift+G のように並べ替える。
 */
export function accel(macNotation: string): string {
  if (IS_MAC) return macNotation

  const modifiers: string[] = []
  // Windows の慣習に合わせて Ctrl → Shift → Alt の順に並べる
  if (macNotation.includes('⌘') || macNotation.includes('⌃')) modifiers.push('Ctrl')
  if (macNotation.includes('⇧')) modifiers.push('Shift')
  if (macNotation.includes('⌥')) modifiers.push('Alt')

  const key = macNotation.replace(/[⌘⇧⌥⌃]/g, '')
  return [...modifiers, key].filter(Boolean).join('+')
}

/** ファイルの場所を開くアプリの呼び名（メニューやツールチップ用） */
export const FILE_MANAGER = IS_WINDOWS ? 'エクスプローラー' : 'Finder'

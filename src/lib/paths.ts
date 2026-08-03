// パスの文字列操作。区切り文字は OS で切り替える。
//
// `\` を区切りとして扱うのは Windows のときだけにしている。
// macOS のファイル名には `\` を使えるため、常に両方を区切り扱いすると
// `my\file.md` のような名前を途中で切ってしまう。

import { IS_WINDOWS } from './platform'

export const MD_EXTS = ['md', 'markdown', 'mdown', 'mkd', 'mdtxt', 'mdtext']

/** パスを組み立てるときに使う区切り */
const SEP = IS_WINDOWS ? '\\' : '/'

/** 区切りとして認める文字（Windows は `/` も通る） */
const SEP_SPLIT = IS_WINDOWS ? /[\\/]/ : /\//

/** 末尾の区切り */
const TRAILING_SEP = IS_WINDOWS ? /[\\/]+$/ : /\/+$/

/** `C:` のようなドライブ表記だけの文字列 */
const DRIVE_ONLY = /^[A-Za-z]:$/

export function isAbsolute(p: string): boolean {
  if (IS_WINDOWS) {
    // C:\... と \\server\share（UNC）
    return /^[A-Za-z]:[\\/]/.test(p) || /^[\\/][\\/]/.test(p)
  }
  return p.startsWith('/')
}

/** 絶対パスの先頭（`/`、`C:\`、`\\server\share\`）。相対パスなら空文字 */
function rootOf(p: string): string {
  if (!isAbsolute(p)) return ''
  if (!IS_WINDOWS) return '/'

  const unc = /^[\\/][\\/][^\\/]+[\\/][^\\/]+/.exec(p)
  if (unc) return `${unc[0]}${SEP}`
  return `${p.slice(0, 2)}${SEP}`
}

function lastSeparator(p: string): number {
  const slash = p.lastIndexOf('/')
  return IS_WINDOWS ? Math.max(slash, p.lastIndexOf('\\')) : slash
}

/** 末尾の区切りを落とす。ルート自身（`/` や `C:\`）はそのまま返す */
function trimTrailing(p: string): string {
  const trimmed = p.replace(TRAILING_SEP, '')
  if (trimmed === '') return p.slice(0, 1)
  if (DRIVE_ONLY.test(trimmed)) return `${trimmed}${SEP}`
  return trimmed
}

export function dirname(p: string): string {
  const root = rootOf(p)
  const trimmed = trimTrailing(p)

  // ルート自身に親はない
  if (root && trimmed.length <= root.length) return root

  const idx = lastSeparator(trimmed)
  if (idx < 0) return '.'
  if (root && idx < root.length) return root
  if (idx === 0) return SEP
  return trimmed.slice(0, idx)
}

export function basename(p: string): string {
  const trimmed = trimTrailing(p)
  const idx = lastSeparator(trimmed)
  if (idx < 0) return trimmed

  const name = trimmed.slice(idx + 1)
  // ドライブルート（`C:\`）は名前が空になる。
  // ツリーの見出しに使うので、区切りを外した `C:` を見せる
  return name === '' ? trimmed.replace(TRAILING_SEP, '') : name
}

export function extname(p: string): string {
  const base = basename(p)
  const idx = base.lastIndexOf('.')
  return idx <= 0 ? '' : base.slice(idx + 1).toLowerCase()
}

/** `.` と `..` を畳んで正規化する */
export function normalize(p: string): string {
  const root = rootOf(p)
  const parts: string[] = []

  for (const segment of (root ? p.slice(root.length) : p).split(SEP_SPLIT)) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') {
        parts.pop()
      } else if (!root) {
        parts.push('..')
      }
      continue
    }
    parts.push(segment)
  }

  const joined = parts.join(SEP)
  if (root) return `${root}${joined}`
  return joined || '.'
}

/** base ディレクトリを基準に相対パスを解決する */
export function resolvePath(base: string, relative: string): string {
  if (isAbsolute(relative)) return normalize(relative)
  return normalize(`${trimTrailing(base)}${SEP}${relative}`)
}

/** root から見た相対パス。root 配下でなければ絶対パスのまま返す */
export function relativeTo(root: string, target: string): string {
  const normalizedRoot = trimTrailing(normalize(root))
  const normalizedTarget = normalize(target)
  if (samePath(normalizedTarget, normalizedRoot)) return basename(normalizedTarget)

  const prefix = normalizedRoot.endsWith(SEP) ? normalizedRoot : `${normalizedRoot}${SEP}`
  if (startsWithPath(normalizedTarget, prefix)) {
    return normalizedTarget.slice(prefix.length)
  }
  return normalizedTarget
}

// Windows のファイルシステムは大文字小文字を区別しないので、比較のときだけ揃える
function samePath(a: string, b: string): boolean {
  return IS_WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b
}

function startsWithPath(value: string, prefix: string): boolean {
  return IS_WINDOWS
    ? value.toLowerCase().startsWith(prefix.toLowerCase())
    : value.startsWith(prefix)
}

export function isMarkdownPath(p: string): boolean {
  return MD_EXTS.includes(extname(p))
}

/** `%20` などが混ざったリンクでも壊れないようにデコードする */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

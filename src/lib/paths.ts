// macOS 専用のため POSIX パスだけを扱う

export const MD_EXTS = ['md', 'markdown', 'mdown', 'mkd', 'mdtxt', 'mdtext']

export function isAbsolute(p: string): boolean {
  return p.startsWith('/')
}

export function dirname(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx < 0) return '.'
  if (idx === 0) return '/'
  return trimmed.slice(0, idx)
}

export function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx < 0 ? trimmed : trimmed.slice(idx + 1)
}

export function extname(p: string): string {
  const base = basename(p)
  const idx = base.lastIndexOf('.')
  return idx <= 0 ? '' : base.slice(idx + 1).toLowerCase()
}

/** `.` と `..` を畳んで正規化する */
export function normalize(p: string): string {
  const absolute = isAbsolute(p)
  const parts: string[] = []

  for (const segment of p.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') {
        parts.pop()
      } else if (!absolute) {
        parts.push('..')
      }
      continue
    }
    parts.push(segment)
  }

  const joined = parts.join('/')
  return absolute ? `/${joined}` : joined || '.'
}

/** base ディレクトリを基準に相対パスを解決する */
export function resolvePath(base: string, relative: string): string {
  if (isAbsolute(relative)) return normalize(relative)
  return normalize(`${base}/${relative}`)
}

/** root から見た相対パス。root 配下でなければ絶対パスのまま返す */
export function relativeTo(root: string, target: string): string {
  const normalizedRoot = normalize(root).replace(/\/+$/, '')
  const normalizedTarget = normalize(target)
  if (normalizedTarget === normalizedRoot) return basename(normalizedTarget)
  if (normalizedTarget.startsWith(`${normalizedRoot}/`)) {
    return normalizedTarget.slice(normalizedRoot.length + 1)
  }
  return normalizedTarget
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

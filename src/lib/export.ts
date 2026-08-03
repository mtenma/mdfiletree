import { highlightAllCodeBlocks } from '../markdown/highlight'
import type { ResolvedTheme } from '../types'
import { readFileDataUri } from './ipc'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * 画面で実際に効いているスタイルをそのまま集める。
 * ビルド後でも開発中でも、見えているものと同じ体裁を書き出せる。
 */
function collectCss(): string {
  const chunks: string[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        chunks.push(rule.cssText)
      }
    } catch {
      // 読み取れないスタイルシート（別オリジン）は諦める
    }
  }

  return chunks.join('\n')
}

/** CSS 内の url(...) を data URI に置き換える（KaTeX のフォントなどを埋め込むため） */
async function inlineCssUrls(css: string): Promise<string> {
  const urls = new Set<string>()
  const pattern = /url\((['"]?)([^'")]+)\1\)/g

  for (const match of css.matchAll(pattern)) {
    const url = match[2].trim()
    if (!url || url.startsWith('data:') || url.startsWith('#')) continue
    urls.add(url)
  }

  const replacements = new Map<string, string>()

  await Promise.all(
    Array.from(urls).map(async (url) => {
      try {
        const response = await fetch(url)
        if (!response.ok) return
        const buffer = await response.arrayBuffer()
        const mime = response.headers.get('content-type') ?? 'application/octet-stream'
        replacements.set(url, `data:${mime};base64,${arrayBufferToBase64(buffer)}`)
      } catch {
        // 取得できないものは元の参照のまま残す
      }
    }),
  )

  return css.replace(pattern, (whole, quote: string, url: string) => {
    const replacement = replacements.get(url.trim())
    return replacement ? `url(${quote}${replacement}${quote})` : whole
  })
}

/** 画像を data URI に置き換えて、単体で開いても崩れないようにする */
async function inlineImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-src-path]'))

  await Promise.all(
    images.map(async (img) => {
      const path = img.dataset.srcPath
      if (!path) return
      try {
        img.src = await readFileDataUri(path)
      } catch {
        img.removeAttribute('src')
        img.setAttribute('alt', `${img.alt || '画像'}（読み込めませんでした）`)
      }
      img.removeAttribute('data-src-path')
      img.removeAttribute('loading')
    }),
  )
}

const RESET_CSS = `
/* 書き出したファイルを単体で開いたときのための最小限の上書き */
html, body { height: auto; overflow: visible; margin: 0; }
body.mdfiletree-export {
  display: block;
  padding: 40px 24px 96px;
  background: var(--bg, #ffffff);
  color: var(--fg, #1f2328);
}
body.mdfiletree-export .export-root { max-width: 980px; margin: 0 auto; }
body.mdfiletree-export .markdown-body { padding: 0; }
`

export interface ExportOptions {
  container: HTMLElement
  title: string
  theme: ResolvedTheme
  fontScale: number
}

export async function buildStandaloneHtml({
  container,
  title,
  theme,
  fontScale,
}: ExportOptions): Promise<string> {
  // 画面外でまだ着色していないコードブロックも仕上げてから複製する
  await highlightAllCodeBlocks(container)

  const clone = container.cloneNode(true) as HTMLElement

  // 閲覧用の操作部品は書き出しに含めない
  clone.querySelectorAll('.code-copy, .mermaid-source').forEach((el) => el.remove())
  clone.querySelectorAll('[tabindex]').forEach((el) => el.removeAttribute('tabindex'))

  await inlineImages(clone)

  const css = await inlineCssUrls(collectCss())
  const escapedTitle = title.replace(/[&<>]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;',
  )

  return `<!doctype html>
<html lang="ja" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<style>
${css}
${RESET_CSS}
</style>
</head>
<body class="mdfiletree-export">
<div class="export-root" style="--font-scale: ${fontScale}">
${clone.outerHTML}
</div>
</body>
</html>
`
}

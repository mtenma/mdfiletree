import { convertFileSrc } from '@tauri-apps/api/core'
import GithubSlugger from 'github-slugger'

import { isAbsolute, isHtmlPath, isMarkdownPath, resolvePath, safeDecode } from '../lib/paths'
import type { TocItem } from '../types'

const EXTERNAL_SCHEME = /^(https?|data|blob|asset|tauri|mailto|tel|ftp|javascript):/i
const WEB_LINK_SCHEME = /^(https?|mailto|tel|ftp):/i

/**
 * 相対パスの画像を asset プロトコル経由の URL に置き換える。
 * Markdown 記法の画像と生 HTML の <img> を同じ経路で扱うため、描画後の DOM に対して行う。
 */
export function resolveImages(root: HTMLElement, docDir: string): void {
  root.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    img.setAttribute('loading', 'lazy')
    img.setAttribute('decoding', 'async')

    if (!src || src.startsWith('#') || EXTERNAL_SCHEME.test(src) || src.startsWith('//')) {
      return
    }

    // クエリやフラグメントはローカルファイルには不要なので落とす
    const bare = safeDecode(src.split('#')[0].split('?')[0])
    const absolute = isAbsolute(bare) ? bare : resolvePath(docDir, bare)

    img.setAttribute('data-src-path', absolute)
    img.setAttribute('src', convertFileSrc(absolute))
    img.addEventListener('error', () => img.classList.add('img-missing'), { once: true })
  })
}

/**
 * リンクを種類ごとに分類して data 属性を付ける。
 * 実際の遷移は DocumentView のクリックハンドラが行う。
 */
export function classifyLinks(root: HTMLElement, docDir: string): void {
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? ''

    if (href.startsWith('#')) {
      anchor.dataset.link = 'anchor'
      anchor.dataset.target = safeDecode(href.slice(1))
      return
    }

    if (WEB_LINK_SCHEME.test(href) || href.startsWith('//')) {
      anchor.dataset.link = 'external'
      anchor.dataset.target = href
      return
    }

    if (EXTERNAL_SCHEME.test(href)) {
      // data: や javascript: など、開く先として扱わないもの
      anchor.dataset.link = 'inert'
      return
    }

    const [pathPart, hash = ''] = href.split('#')
    const bare = safeDecode(pathPart)
    if (!bare) {
      anchor.dataset.link = 'anchor'
      anchor.dataset.target = safeDecode(hash)
      return
    }

    const absolute = isAbsolute(bare) ? bare : resolvePath(docDir, bare)
    anchor.dataset.link = isMarkdownPath(absolute) || isHtmlPath(absolute) ? 'doc' : 'file'
    anchor.dataset.target = absolute
    if (hash) anchor.dataset.hash = safeDecode(hash)
  })
}

/** 見出しの末尾に書ける `{#custom-id}` 記法 */
const EXPLICIT_ID = /\s*\{#([A-Za-z0-9_\-:.]+)\}\s*$/

/** 見出しの表示テキスト（KaTeX の MathML 部分は読み上げ用の重複なので取り除く） */
function headingText(heading: HTMLElement): string {
  const clone = heading.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.katex-mathml, .mermaid-source').forEach((el) => el.remove())
  return (clone.textContent ?? '').trim()
}

/**
 * `## 見出し {#anchor}` の指定を拾って id にし、表示からは取り除く。
 * markdown-it-attrs は表の描画を壊すため使っておらず、ここで最小限だけ実現している。
 */
function applyExplicitId(heading: HTMLElement): string | null {
  const text = headingText(heading)
  const match = text.match(EXPLICIT_ID)
  if (!match) return null

  // 記法は必ず見出しの最後にあるので、末尾のテキストノードから消す
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  let node = walker.nextNode()
  while (node) {
    last = node as Text
    node = walker.nextNode()
  }

  if (last) {
    last.nodeValue = (last.nodeValue ?? '').replace(EXPLICIT_ID, '')
  }

  return match[1]
}

/**
 * 見出しに GitHub 互換の id を振り、目次を組み立てる。
 * markdown-it 側ではなく DOM で行うことで、生 HTML の見出しも同じ規則で扱える。
 */
export function assignHeadingIds(root: HTMLElement): TocItem[] {
  const slugger = new GithubSlugger()
  const used = new Set<string>()

  // `{#custom-id}` などで既に付いている id は温存し、衝突だけ避ける
  root.querySelectorAll('[id]').forEach((el) => used.add(el.id))

  const items: TocItem[] = []

  root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    if (!heading.id) {
      const explicit = applyExplicitId(heading)
      if (explicit) heading.id = explicit
    }

    const text = headingText(heading)

    if (!heading.id) {
      let candidate = slugger.slug(text || 'section')
      while (used.has(candidate)) {
        candidate = slugger.slug(text || 'section')
      }
      heading.id = candidate
    }

    used.add(heading.id)
    items.push({
      id: heading.id,
      text: text || '(無題の見出し)',
      level: Number(heading.tagName.slice(1)),
    })
  })

  return items
}

/** コードブロックに言語名とコピーボタンを付ける（Shiki の着色前に行う） */
export function decorateCodeBlocks(root: HTMLElement): void {
  root.querySelectorAll<HTMLPreElement>('pre.code-block').forEach((pre) => {
    if (pre.parentElement?.classList.contains('code-wrap')) return

    const lang = pre.dataset.lang ?? ''
    const wrap = document.createElement('div')
    wrap.className = 'code-wrap'
    if (lang) wrap.dataset.lang = lang

    const head = document.createElement('div')
    head.className = 'code-head'

    const label = document.createElement('span')
    label.className = 'code-lang'
    label.textContent = lang || 'text'

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'code-copy'
    copy.textContent = 'コピー'

    head.append(label, copy)

    pre.replaceWith(wrap)
    wrap.append(head, pre)
  })
}

/**
 * 表の見せ方を実測して決める。
 *
 * - 枠に収まらない表だけ横スクロール領域にする。収まる表を囲ってしまうと
 *   そこがスクロール基準になり、見出し行をページ基準で固定できなくなるため。
 * - ヘッダーが複数行ある表（MultiMarkdown のグループ見出し）で固定位置が重ならないよう、
 *   各行の高さを実測して top を積み上げる。
 */
export function markTables(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.table-wrap').forEach((wrap) => {
    const table = wrap.querySelector('table')
    if (!table) return

    if (table.scrollWidth > wrap.clientWidth + 1) {
      wrap.dataset.wide = '1'
    } else {
      delete wrap.dataset.wide
    }

    let offset = 0
    table.querySelectorAll<HTMLElement>('thead tr').forEach((row) => {
      row.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
        cell.style.top = `${offset}px`
      })
      offset += row.offsetHeight
    })
  })
}

/**
 * scroller の中身における element の上端位置を返す。
 *
 * getBoundingClientRect と scrollTop を混ぜて計算すると、
 * スムーズスクロールの最中に両者が食い違って移動先がずれる。
 * offsetTop はレイアウト上の値なので、スクロールの状態に左右されない。
 */
export function offsetWithin(element: HTMLElement, scroller: HTMLElement): number {
  let top = 0
  let current: HTMLElement | null = element

  while (current && current !== scroller) {
    top += current.offsetTop
    current = current.offsetParent as HTMLElement | null
  }

  return top
}

/** 見出し要素と、その表示位置を返す（スクロール位置の復元に使う） */
export function topmostHeadingId(container: HTMLElement, scroller: HTMLElement): string | null {
  const headings = container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
  const scrollerTop = scroller.getBoundingClientRect().top
  let last: string | null = null

  for (const heading of headings) {
    if (heading.getBoundingClientRect().top - scrollerTop <= 8) {
      last = heading.id || last
    } else {
      break
    }
  }

  return last
}

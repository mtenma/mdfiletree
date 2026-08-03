import type { Highlighter } from 'shiki'

type ShikiModule = typeof import('shiki')

const THEME_LIGHT = 'github-light'
const THEME_DARK = 'github-dark'

let contextPromise: Promise<{ shiki: ShikiModule; highlighter: Highlighter }> | null = null

/**
 * Shiki は WASM 版の正規表現エンジンを既定で使うが、
 * それだと CSP の script-src に穴を開ける必要が出るため JavaScript エンジンを指定する。
 */
async function getContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const shiki = await import('shiki')
      const highlighter = await shiki.createHighlighter({
        themes: [THEME_LIGHT, THEME_DARK],
        langs: [],
        engine: shiki.createJavaScriptRegexEngine({ forgiving: true }),
      })
      return { shiki, highlighter }
    })()
  }
  return contextPromise
}

function resolveLanguage(shiki: ShikiModule, lang: string): string | null {
  if (!lang) return null
  const key = lang.toLowerCase()
  if (key in shiki.bundledLanguages) return key
  if (key in shiki.bundledLanguagesAlias) return key
  return null
}

async function highlightBlock(pre: HTMLPreElement): Promise<void> {
  if (pre.dataset.highlighted) return
  pre.dataset.highlighted = 'pending'

  const code = pre.textContent ?? ''
  const { shiki, highlighter } = await getContext()
  const lang = resolveLanguage(shiki, pre.dataset.lang ?? '')

  if (!lang) {
    pre.dataset.highlighted = 'skipped'
    return
  }

  try {
    await highlighter.loadLanguage(lang as never)
    // ライト / ダークの両方を CSS 変数として埋め、テーマ切り替え時の再着色を不要にする
    const html = highlighter.codeToHtml(code, {
      lang,
      themes: { light: THEME_LIGHT, dark: THEME_DARK },
      defaultColor: false,
    })

    // Shiki が生成した HTML はコード文字列をエスケープ済みで、外部由来のマークアップは含まない。
    // 無害化を通すと着色用の CSS 変数が落ちるため、ここでは生成結果をそのまま使う。
    const template = document.createElement('template')
    template.innerHTML = html
    const next = template.content.firstElementChild

    if (next instanceof HTMLElement) {
      next.classList.add('code-block')
      if (pre.dataset.lang) next.dataset.lang = pre.dataset.lang
      next.dataset.highlighted = 'done'
      pre.replaceWith(next)
    } else {
      pre.dataset.highlighted = 'failed'
    }
  } catch (error) {
    console.warn('コードの着色に失敗しました', error)
    pre.dataset.highlighted = 'failed'
  }
}

export interface HighlightHandle {
  dispose(): void
}

/**
 * 画面に入ったコードブロックから順に着色する。
 * 長い文書で数百のブロックを一度に処理して固まるのを避けるため。
 */
export function highlightVisibleCodeBlocks(root: HTMLElement): HighlightHandle {
  const blocks = Array.from(
    root.querySelectorAll<HTMLPreElement>('pre.code-block:not([data-highlighted])'),
  )

  if (blocks.length === 0) {
    return { dispose: () => {} }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        void highlightBlock(entry.target as HTMLPreElement)
      }
    },
    { rootMargin: '600px 0px' },
  )

  blocks.forEach((block) => observer.observe(block))

  return { dispose: () => observer.disconnect() }
}

/** 書き出し前など、未着色のブロックをすべて処理したいとき用 */
export async function highlightAllCodeBlocks(root: HTMLElement): Promise<void> {
  const blocks = Array.from(
    root.querySelectorAll<HTMLPreElement>('pre.code-block:not([data-highlighted])'),
  )
  for (const block of blocks) {
    await highlightBlock(block)
  }
}

import type { ResolvedTheme } from '../types'

type Mermaid = (typeof import('mermaid'))['default']

let mermaidPromise: Promise<Mermaid> | null = null
let appliedTheme: ResolvedTheme | null = null
let idCounter = 0

async function getMermaid(theme: ResolvedTheme): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => module.default)
  }

  const mermaid = await mermaidPromise

  if (appliedTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      // ラベルに書かれた HTML を実行させない
      securityLevel: 'strict',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif',
    })
    appliedTheme = theme
  }

  return mermaid
}

/** mermaid が body 直下に残すことがある計測用の要素を消す */
function cleanupTemporaryNodes(id: string): void {
  document.body.querySelector(`:scope > #${CSS.escape(id)}`)?.remove()
  document.body.querySelector(`:scope > #${CSS.escape(`d${id}`)}`)?.remove()
}

function showError(block: HTMLElement, message: string): void {
  block.dataset.state = 'error'
  block.querySelectorAll(':scope > .mermaid-render, :scope > .mermaid-error').forEach((el) =>
    el.remove(),
  )

  const notice = document.createElement('p')
  notice.className = 'mermaid-error'
  notice.textContent = `図を描画できませんでした: ${message}`
  block.prepend(notice)
}

/**
 * ```mermaid ブロックを SVG に差し替える。
 * テーマを変えたときは配色を合わせるために描き直す。
 */
export async function renderMermaidBlocks(
  root: HTMLElement,
  theme: ResolvedTheme,
  isCancelled: () => boolean,
): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block')).filter(
    (block) => block.dataset.state !== 'done' || block.dataset.theme !== theme,
  )

  if (blocks.length === 0) return

  const mermaid = await getMermaid(theme)
  if (isCancelled()) return

  for (const block of blocks) {
    if (isCancelled()) return

    const source = block.querySelector('.mermaid-source')?.textContent ?? ''
    if (!source.trim()) {
      showError(block, '内容が空です')
      continue
    }

    const id = `mermaid-render-${++idCounter}`

    try {
      const { svg } = await mermaid.render(id, source)

      // mermaid が文字幅の計測用に body へ挿した一時要素を片付ける。
      // 返ってきた SVG も同じ id を持つため、差し込む「前」に済ませないと本体まで消えてしまう。
      cleanupTemporaryNodes(id)

      if (isCancelled()) return

      block.querySelectorAll(':scope > .mermaid-render, :scope > .mermaid-error').forEach((el) =>
        el.remove(),
      )

      const holder = document.createElement('div')
      holder.className = 'mermaid-render'
      // mermaid が securityLevel: 'strict' で生成・無害化した SVG をそのまま置く
      holder.innerHTML = svg
      block.append(holder)

      block.dataset.state = 'done'
      block.dataset.theme = theme
    } catch (error) {
      cleanupTemporaryNodes(id)
      showError(block, error instanceof Error ? error.message : String(error))
    }
  }
}

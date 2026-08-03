import type { PluginSimple } from 'markdown-it'

/**
 * コードフェンスの出力を後処理しやすい形に固定する。
 *
 * - ```mermaid は描画待ちのブロックとして出し、後から SVG に差し替える
 * - それ以外は素の <pre><code> のまま出し、無害化を通したあとに Shiki で着色する
 *   （markdown-it の段階で着色すると、DOMPurify が Shiki の CSS 変数を落としかねない）
 */
export const fenceBlocks: PluginSimple = (md) => {
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
    const lang = info.split(/\s+/)[0] ?? ''
    const escaped = md.utils.escapeHtml(token.content)

    if (lang.toLowerCase() === 'mermaid') {
      return `<div class="mermaid-block" data-state="pending"><pre class="mermaid-source">${escaped}</pre></div>\n`
    }

    const langLower = lang.toLowerCase()
    const langAttr = langLower ? ` data-lang="${md.utils.escapeHtml(langLower)}"` : ''
    const langClass = langLower ? ` class="language-${md.utils.escapeHtml(langLower)}"` : ''
    return `<pre class="code-block"${langAttr}><code${langClass}>${escaped}</code></pre>\n`
  }
}

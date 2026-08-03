import type MarkdownIt from 'markdown-it'
import type { PluginSimple } from 'markdown-it'

type RenderRule = NonNullable<MarkdownIt['renderer']['rules'][string]>

/**
 * 表を横スクロールできるラッパで囲む。
 * これがないと列の多い表でページ全体が横に伸び、本文まで読みづらくなる。
 * tabindex を付けてキーボードでもスクロールできるようにしている。
 */
export const tableWrap: PluginSimple = (md) => {
  const renderToken: RenderRule = (tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options)

  const renderOpen = md.renderer.rules.table_open ?? renderToken
  const renderClose = md.renderer.rules.table_close ?? renderToken

  md.renderer.rules.table_open = (tokens, idx, options, env, self) =>
    `<div class="table-wrap" tabindex="0" role="region" aria-label="表">${renderOpen(
      tokens,
      idx,
      options,
      env,
      self,
    )}`

  md.renderer.rules.table_close = (tokens, idx, options, env, self) =>
    `${renderClose(tokens, idx, options, env, self)}</div>`
}

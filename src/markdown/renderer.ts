import MarkdownIt, { type PluginWithOptions } from 'markdown-it'
import multimdTable from 'markdown-it-multimd-table'
import footnote from 'markdown-it-footnote'
import deflist from 'markdown-it-deflist'
import taskLists from 'markdown-it-task-lists'
import { full as emoji } from 'markdown-it-emoji'
import mark from 'markdown-it-mark'
import ins from 'markdown-it-ins'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import abbr from 'markdown-it-abbr'
import githubAlerts from 'markdown-it-github-alerts'
import katex from 'katex'
import katexImport, { type MarkdownKatexOptions } from '@vscode/markdown-it-katex'

import { splitFrontMatter } from './frontmatter'
import { sanitizeHtml } from './sanitize'
import { tableWrap } from './plugins/tableWrap'
import { fenceBlocks } from './plugins/fenceBlocks'

type KatexPlugin = PluginWithOptions<MarkdownKatexOptions>

/**
 * この plugin だけ CommonJS で提供されており、`__esModule` を defineProperty で立てているため
 * bundler の相互運用で default がもう一段包まれることがある。両方の形に対応しておく。
 */
const katexPlugin: KatexPlugin =
  (katexImport as unknown as { default?: KatexPlugin }).default ??
  (katexImport as unknown as KatexPlugin)

export interface RenderResult {
  html: string
  frontMatter: Record<string, unknown> | null
  frontMatterRaw: string | null
  hasMath: boolean
  hasMermaid: boolean
}

/*
 * markdown-it-attrs（`{#id}` `{.class}` 記法）は入れていない。
 * あの plugin も表の列数を数え直して余分なセルを hidden にするため、
 * multimd-table が付けた colspan / rowspan と衝突してセルが消えてしまう。
 * 表の再現を優先し、よく使う見出しの `{#id}` だけ dom.ts 側で拾っている。
 */
const md = new MarkdownIt({
  // 生の HTML 表をそのまま通すために必要。危険な要素は sanitize 側で落とす
  html: true,
  linkify: true,
  breaks: false,
  typographer: false,
  langPrefix: 'language-',
})
  // GFM のパイプ表に加えて、列結合 `||`・行結合 `^^`・複数行セル・
  // キャプション・ヘッダーレス表まで解釈する
  .use(multimdTable, {
    multiline: true,
    rowspan: true,
    headerless: true,
    multibody: true,
    autolabel: true,
  })
  .use(footnote)
  .use(deflist)
  .use(taskLists, { label: true })
  .use(emoji)
  .use(mark)
  .use(ins)
  .use(sub)
  .use(sup)
  .use(abbr)
  // > [!NOTE] などの GitHub 形式の注意書き
  .use(githubAlerts)
  .use(katexPlugin, {
    // plugin が内部で取り込む katex は bundler の相互運用で壊れることがあるため、
    // こちらで読み込んだ実体を明示的に渡す
    katex,
    enableBareBlocks: true,
    enableMathBlockInHtml: true,
    enableMathInlineInHtml: true,
    throwOnError: false,
  })
  .use(fenceBlocks)
  .use(tableWrap)

export function renderMarkdown(source: string): RenderResult {
  const { data, raw, body } = splitFrontMatter(source)
  const html = sanitizeHtml(md.render(body))

  return {
    html,
    frontMatter: data,
    frontMatterRaw: raw,
    hasMath: html.includes('katex'),
    hasMermaid: html.includes('mermaid-block'),
  }
}

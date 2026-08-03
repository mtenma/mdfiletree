import DOMPurify from 'dompurify'

/**
 * 開いた Markdown は必ずしも信頼できない（配布された .md を読むこともある）。
 * webview 内のスクリプトは Tauri のコマンドを呼べてしまうため、描画前に必ず無害化する。
 *
 * 一方で表の再現には colspan / rowspan / align などが不可欠なので、
 * 表まわりの属性は明示的に通す。
 */
const CONFIG = {
  // 実行可能なもの・アプリの見た目を壊すものだけを落とす
  FORBID_TAGS: [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'base',
    'meta',
    'link',
    'noscript',
    'frame',
    'frameset',
    'applet',
  ],
  FORBID_ATTR: ['srcdoc', 'sandbox', 'formaction'],
  ADD_ATTR: [
    // 表の構造
    'colspan',
    'rowspan',
    'headers',
    'scope',
    'align',
    'valign',
    'width',
    'height',
    'span',
    // 一般
    'id',
    'class',
    'style',
    'dir',
    'lang',
    'title',
    'start',
    'reversed',
    'type',
    'value',
    'checked',
    'disabled',
    'loading',
    'decoding',
    'tabindex',
    'role',
    'aria-hidden',
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
  ],
  // data-* はリンク種別や画像の元パスの受け渡しに使う
  ALLOW_DATA_ATTR: true,
} satisfies Parameters<typeof DOMPurify.sanitize>[1]

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, CONFIG)
}

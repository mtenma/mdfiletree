import { useMemo } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'

interface HtmlViewProps {
  content: string
  docDir: string
}

/**
 * `<head>` の直後に `<base>` を差し込む。
 * `<head>` が無い文書は `<html>` の直後、それも無ければ先頭に置く。
 * href は convertFileSrc が percent-encode した URL なので `"` を含まず、注入しても壊れない。
 */
function injectBase(content: string, baseHref: string): string {
  const baseTag = `<base href="${baseHref}">`

  const head = /<head\b[^>]*>/i.exec(content)
  if (head) {
    const at = head.index + head[0].length
    return `${content.slice(0, at)}${baseTag}${content.slice(at)}`
  }

  const html = /<html\b[^>]*>/i.exec(content)
  if (html) {
    const at = html.index + html[0].length
    return `${content.slice(0, at)}${baseTag}${content.slice(at)}`
  }

  return `${baseTag}${content}`
}

/**
 * HTML ファイルを元のデザインのまま表示する。
 * sandbox 属性（全制限）でスクリプト・フォーム・ページ遷移を無効化しつつ、
 * CSS と画像は `<base>` 経由で asset プロトコルへ解決して生かす。
 */
export function HtmlView({ content, docDir }: HtmlViewProps) {
  const srcDoc = useMemo(
    () => injectBase(content, `${convertFileSrc(docDir)}/`),
    [content, docDir],
  )

  return <iframe className="html-frame" sandbox="" srcDoc={srcDoc} title="HTML 文書" />
}

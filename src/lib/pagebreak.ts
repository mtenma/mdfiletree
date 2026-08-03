import { PAGE_BREAK_MARKER, isPageBreakLine } from '../markdown/renderer'

/**
 * 改ページの目印を出し入れする。
 *
 * 画面の要素が持つ data-line は front matter を除いた本文での行番号なので、
 * ファイルの行に直すために lineOffset を足す。
 */

/** 指定した行の手前に目印を入れた本文を返す */
export function insertPageBreakAt(content: string, line: number, lineOffset: number): string {
  const lines = content.split('\n')
  const at = Math.min(Math.max(0, line + lineOffset), lines.length)
  // 目印の後ろに空行を置かないと、続くブロックが目印と地続きに解釈される
  lines.splice(at, 0, PAGE_BREAK_MARKER, '')
  return lines.join('\n')
}

/**
 * 指定した行にある目印を取り除いた本文を返す。
 * その行が目印でなければ null を返す（誤って別の行を消さないため）。
 */
export function removePageBreakAt(
  content: string,
  line: number,
  lineOffset: number,
): string | null {
  const lines = content.split('\n')
  const at = line + lineOffset
  if (!isPageBreakLine(lines[at])) return null

  // 入れるときに添えた空行も一緒に片付ける
  const count = lines[at + 1]?.trim() === '' ? 2 : 1
  lines.splice(at, count)
  return lines.join('\n')
}

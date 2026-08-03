import { load as parseYaml } from 'js-yaml'

export interface FrontMatter {
  /** パースに成功した場合のオブジェクト */
  data: Record<string, unknown> | null
  /** 元の YAML テキスト（パース失敗時の表示に使う） */
  raw: string | null
  /** front matter を取り除いた本文 */
  body: string
  /**
   * front matter が占める行数。
   * 本文中の行番号をファイル全体の行番号に戻すときに足す。
   */
  lineOffset: number
}

const FRONT_MATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function splitFrontMatter(source: string): FrontMatter {
  const match = source.match(FRONT_MATTER)
  if (!match) {
    return { data: null, raw: null, body: source, lineOffset: 0 }
  }

  const raw = match[1]
  const body = source.slice(match[0].length)
  const lineOffset = (match[0].match(/\n/g) ?? []).length

  try {
    const parsed = parseYaml(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown>, raw, body, lineOffset }
    }
    return { data: null, raw, body, lineOffset }
  } catch {
    // YAML として壊れていても本文は読めるようにする
    return { data: null, raw, body, lineOffset }
  }
}

/** front matter の値を1行の文字列に整える */
export function formatFrontMatterValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(formatFrontMatterValue).join(', ')
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

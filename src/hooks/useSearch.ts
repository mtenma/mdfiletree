import { useCallback, useEffect, useRef, useState } from 'react'

const HIGHLIGHT_ALL = 'mdfiletree-search'
const HIGHLIGHT_CURRENT = 'mdfiletree-search-current'

/** CSS Custom Highlight API が使えるか（macOS の WebKit は対応済み） */
export const searchSupported =
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'

function collectRanges(root: HTMLElement, needle: string): Range[] {
  const ranges: Range[] = []
  const lowered = needle.toLowerCase()

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      // 読み上げ用の重複テキストや、描画前の図のソースは対象外にする
      if (parent.closest('script, style, .katex-mathml, .mermaid-source')) {
        return NodeFilter.FILTER_REJECT
      }
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })

  let node = walker.nextNode()
  while (node) {
    const text = (node.nodeValue ?? '').toLowerCase()
    let from = 0

    for (;;) {
      const found = text.indexOf(lowered, from)
      if (found < 0) break
      const range = document.createRange()
      range.setStart(node, found)
      range.setEnd(node, found + lowered.length)
      ranges.push(range)
      from = found + lowered.length
    }

    node = walker.nextNode()
  }

  return ranges
}

interface UseSearchOptions {
  bodyRef: React.RefObject<HTMLElement | null>
  scrollerRef: React.RefObject<HTMLElement | null>
  /** 文書が変わったことを知らせる値。変わると検索結果を組み直す */
  contentKey: unknown
}

export function useSearch({ bodyRef, scrollerRef, contentKey }: UseSearchOptions) {
  const [query, setQuery] = useState('')
  const [total, setTotal] = useState(0)
  const [index, setIndex] = useState(-1)
  const rangesRef = useRef<Range[]>([])

  const clearHighlights = useCallback(() => {
    if (!searchSupported) return
    CSS.highlights.delete(HIGHLIGHT_ALL)
    CSS.highlights.delete(HIGHLIGHT_CURRENT)
  }, [])

  const scrollToRange = useCallback(
    (range: Range) => {
      const scroller = scrollerRef.current
      if (!scroller) return
      const rect = range.getBoundingClientRect()
      const scrollerRect = scroller.getBoundingClientRect()
      // すでに見えている位置なら動かさない
      if (rect.top >= scrollerRect.top + 40 && rect.bottom <= scrollerRect.bottom - 40) return
      scroller.scrollTop += rect.top - scrollerRect.top - scroller.clientHeight / 3
    },
    [scrollerRef],
  )

  // 検索語または文書が変わったら、ヒット範囲を組み直す
  useEffect(() => {
    if (!searchSupported) return

    const body = bodyRef.current
    const needle = query.trim()

    clearHighlights()
    rangesRef.current = []

    if (!body || needle.length === 0) {
      setTotal(0)
      setIndex(-1)
      return
    }

    const ranges = collectRanges(body, needle)
    rangesRef.current = ranges
    setTotal(ranges.length)

    if (ranges.length === 0) {
      setIndex(-1)
      return
    }

    CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...ranges))
    setIndex(0)
  }, [query, contentKey, bodyRef, clearHighlights])

  // 現在位置のハイライトと、そこへのスクロール
  useEffect(() => {
    if (!searchSupported) return

    const ranges = rangesRef.current
    if (index < 0 || index >= ranges.length) {
      CSS.highlights.delete(HIGHLIGHT_CURRENT)
      return
    }

    const current = ranges[index]
    CSS.highlights.set(HIGHLIGHT_CURRENT, new Highlight(current))
    scrollToRange(current)
  }, [index, total, scrollToRange])

  useEffect(() => clearHighlights, [clearHighlights])

  const next = useCallback(() => {
    setIndex((previous) => (total === 0 ? -1 : (previous + 1) % total))
  }, [total])

  const previous = useCallback(() => {
    setIndex((current) => (total === 0 ? -1 : (current - 1 + total) % total))
  }, [total])

  const reset = useCallback(() => {
    setQuery('')
    setTotal(0)
    setIndex(-1)
    rangesRef.current = []
    clearHighlights()
  }, [clearHighlights])

  return { query, setQuery, total, index, next, previous, reset }
}

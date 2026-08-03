import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'

import {
  assignHeadingIds,
  classifyLinks,
  decorateCodeBlocks,
  markTables,
  offsetWithin,
  resolveImages,
} from '../markdown/dom'
import { highlightVisibleCodeBlocks } from '../markdown/highlight'
import { renderMermaidBlocks } from '../markdown/mermaid'
import type { RenderResult } from '../markdown/renderer'
import { formatFrontMatterValue } from '../markdown/frontmatter'
import { revealInFinder } from '../lib/ipc'
import type { ResolvedTheme, TocItem } from '../types'

export type ScrollTarget =
  | { kind: 'top' }
  | { kind: 'anchor'; id: string }
  | { kind: 'restore'; headingId: string | null; offset: number }

interface DocumentViewProps {
  result: RenderResult
  docDir: string
  theme: ResolvedTheme
  scrollTarget: ScrollTarget
  scrollerRef: React.RefObject<HTMLDivElement | null>
  bodyRef: React.RefObject<HTMLDivElement | null>
  onToc: (items: TocItem[]) => void
  onActiveHeading: (id: string | null) => void
  onOpenDoc: (path: string, hash?: string) => void
  onError: (message: string) => void
}

function FrontMatterCard({ result }: { result: RenderResult }) {
  if (result.frontMatter) {
    const entries = Object.entries(result.frontMatter)
    if (entries.length === 0) return null
    return (
      <section className="front-matter" aria-label="文書情報">
        <dl>
          {entries.map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt>{key}</dt>
              <dd>{formatFrontMatterValue(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
    )
  }

  if (result.frontMatterRaw) {
    return (
      <section className="front-matter" aria-label="文書情報">
        <pre>{result.frontMatterRaw}</pre>
      </section>
    )
  }

  return null
}

export function DocumentView({
  result,
  docDir,
  theme,
  scrollTarget,
  scrollerRef,
  bodyRef,
  onToc,
  onActiveHeading,
  onOpenDoc,
  onError,
}: DocumentViewProps) {
  const copyTimerRef = useRef<number | undefined>(undefined)

  /*
   * React は dangerouslySetInnerHTML の値を「参照」で比較し、
   * 違えば中身が同じでも innerHTML を入れ直す。
   * 毎回 { __html } を作ると再レンダリングのたびに本文が作り直され、
   * 描画後に加えた処理（見出しの id、コードの着色、画像パスの書き換え、
   * Mermaid の SVG、表の計測）がすべて失われる。
   * そのため内容が変わったときだけ新しい参照になるようにしている。
   */
  const htmlProp = useMemo(() => ({ __html: result.html }), [result.html])

  // 描画直後に DOM を仕上げてから、狙った位置へスクロールする
  useLayoutEffect(() => {
    const body = bodyRef.current
    const scroller = scrollerRef.current
    if (!body || !scroller) return

    resolveImages(body, docDir)
    classifyLinks(body, docDir)
    decorateCodeBlocks(body)
    const toc = assignHeadingIds(body)
    markTables(body)
    onToc(toc)

    // スムーズスクロールは復元時には邪魔なので、いったん切る
    const previousBehavior = scroller.style.scrollBehavior
    scroller.style.scrollBehavior = 'auto'

    if (scrollTarget.kind === 'top') {
      scroller.scrollTop = 0
    } else if (scrollTarget.kind === 'anchor') {
      const element = body.querySelector<HTMLElement>(`#${CSS.escape(scrollTarget.id)}`)
      scroller.scrollTop = element ? Math.max(0, offsetWithin(element, scroller) - 12) : 0
    } else {
      const heading = scrollTarget.headingId
        ? body.querySelector<HTMLElement>(`#${CSS.escape(scrollTarget.headingId)}`)
        : null
      scroller.scrollTop = heading
        ? Math.max(0, offsetWithin(heading, scroller) - 12)
        : scrollTarget.offset
    }

    scroller.style.scrollBehavior = previousBehavior
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  // コードの着色と作図。テーマを変えたときも描き直す
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return

    let cancelled = false
    const handle = highlightVisibleCodeBlocks(body)
    void renderMermaidBlocks(body, theme, () => cancelled).catch((error) => {
      console.warn('図の描画に失敗しました', error)
    })

    return () => {
      cancelled = true
      handle.dispose()
    }
  }, [result, theme, bodyRef])

  // 表示中の見出しを目次に伝える
  useEffect(() => {
    const body = bodyRef.current
    const scroller = scrollerRef.current
    if (!body || !scroller) return

    const headings = Array.from(body.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
    if (headings.length === 0) {
      onActiveHeading(null)
      return
    }

    let frame = 0
    const update = () => {
      frame = 0
      const threshold = scroller.getBoundingClientRect().top + 80
      let current: string | null = headings[0].id || null

      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= threshold) {
          current = heading.id || current
        } else {
          break
        }
      }

      // 最下部まで来たら最後の見出しを選ぶ（短い節が選ばれないままになるのを防ぐ）
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
        current = headings[headings.length - 1].id || current
      }

      onActiveHeading(current)
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    scroller.addEventListener('scroll', onScroll, { passive: true })
    update()

    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [result, bodyRef, scrollerRef, onActiveHeading])

  // 表の幅は画像や図の描画、ペインの開閉で変わるため、落ち着いたころに測り直す
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return

    const timer = window.setTimeout(() => markTables(body), 600)
    const observer = new ResizeObserver(() => markTables(body))
    observer.observe(body)

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [result, bodyRef])

  useEffect(() => () => window.clearTimeout(copyTimerRef.current), [])

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement

      const copyButton = target.closest<HTMLButtonElement>('button.code-copy')
      if (copyButton) {
        event.preventDefault()
        const code = copyButton.closest('.code-wrap')?.querySelector('pre')?.textContent ?? ''
        void navigator.clipboard
          .writeText(code)
          .then(() => {
            copyButton.textContent = 'コピーしました'
            window.clearTimeout(copyTimerRef.current)
            copyTimerRef.current = window.setTimeout(() => {
              copyButton.textContent = 'コピー'
            }, 1400)
          })
          .catch(() => onError('クリップボードにコピーできませんでした'))
        return
      }

      const anchor = target.closest<HTMLAnchorElement>('a[data-link]')
      if (!anchor) return

      const kind = anchor.dataset.link
      const value = anchor.dataset.target ?? ''
      event.preventDefault()

      if (kind === 'anchor') {
        const body = bodyRef.current
        const scroller = scrollerRef.current
        if (!body || !scroller || !value) return
        const element =
          body.querySelector<HTMLElement>(`#${CSS.escape(value)}`) ??
          body.querySelector<HTMLElement>(`[name="${CSS.escape(value)}"]`)
        if (element) {
          scroller.scrollTo({
            top: Math.max(0, offsetWithin(element, scroller) - 12),
            behavior: 'smooth',
          })
        }
        return
      }

      if (kind === 'external') {
        void openUrl(value).catch(() => onError(`リンクを開けませんでした: ${value}`))
        return
      }

      if (kind === 'doc') {
        onOpenDoc(value, anchor.dataset.hash)
        return
      }

      if (kind === 'file') {
        void revealInFinder(value).catch(() => onError(`Finder で表示できませんでした: ${value}`))
      }
    },
    [bodyRef, onError, onOpenDoc, scrollerRef],
  )

  return (
    <div className="doc-inner">
      <FrontMatterCard result={result} />
      <article
        ref={bodyRef}
        className="markdown-body"
        onClick={handleClick}
        // renderer.ts で DOMPurify を通したうえで、Shiki と Mermaid は描画後の DOM に適用している
        dangerouslySetInnerHTML={htmlProp}
      />
    </div>
  )
}

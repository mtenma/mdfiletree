import { useEffect, useRef } from 'react'
import type { TocItem } from '../types'

interface TocPanelProps {
  items: TocItem[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function TocPanel({ items, activeId, onSelect }: TocPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 読み進めたときに、目次側も追従してスクロールさせる
  useEffect(() => {
    if (!activeId || !containerRef.current) return
    const active = containerRef.current.querySelector<HTMLElement>('[aria-current="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  if (items.length === 0) {
    return <p className="empty-note">見出しがありません。</p>
  }

  return (
    <div ref={containerRef}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`toc-item toc-level-${item.level}`}
          aria-current={item.id === activeId}
          title={item.text}
          onClick={() => onSelect(item.id)}
        >
          {item.text}
        </button>
      ))}
    </div>
  )
}

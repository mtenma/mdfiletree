import { useEffect, useRef } from 'react'

interface SearchBarProps {
  query: string
  total: number
  index: number
  supported: boolean
  onQueryChange: (value: string) => void
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
}

export function SearchBar({
  query,
  total,
  index,
  supported,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="search-bar" role="search">
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        value={query}
        placeholder={supported ? '文書内を検索' : '検索は利用できません'}
        disabled={!supported}
        aria-label="文書内を検索"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (event.shiftKey) onPrevious()
            else onNext()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
      />

      <span className="search-count">
        {query.trim().length === 0 ? '' : total === 0 ? '見つかりません' : `${index + 1} / ${total}`}
      </span>

      <button
        type="button"
        className="tool-button"
        title="前を検索 (⇧⌘G)"
        aria-label="前を検索"
        disabled={total === 0}
        onClick={onPrevious}
      >
        ↑
      </button>
      <button
        type="button"
        className="tool-button"
        title="次を検索 (⌘G)"
        aria-label="次を検索"
        disabled={total === 0}
        onClick={onNext}
      >
        ↓
      </button>
      <button type="button" className="tool-button" aria-label="検索を閉じる" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}

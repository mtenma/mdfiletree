import { useCallback, useRef, useState } from 'react'

interface SplitterProps {
  width: number
  min: number
  max: number
  onChange: (width: number) => void
  onCommit: (width: number) => void
  label: string
}

/** ペインの幅を変えるための細い仕切り。ドラッグとキーボードの両方に対応する。 */
export function Splitter({ width, min, max, onChange, onCommit, label }: SplitterProps) {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef({ x: 0, width })

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const element = event.currentTarget
      element.setPointerCapture(event.pointerId)
      startRef.current = { x: event.clientX, width }
      setDragging(true)
    },
    [width],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      const next = startRef.current.width + (event.clientX - startRef.current.x)
      onChange(Math.min(max, Math.max(min, Math.round(next))))
    },
    [dragging, max, min, onChange],
  )

  const finish = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      event.currentTarget.releasePointerCapture(event.pointerId)
      setDragging(false)
      onCommit(width)
    },
    [dragging, onCommit, width],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 32 : 8
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onCommit(Math.max(min, width - step))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        onCommit(Math.min(max, width + step))
      }
    },
    [max, min, onCommit, width],
  )

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-dragging={dragging}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={handleKeyDown}
    />
  )
}

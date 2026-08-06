import { useCallback } from 'react'
import type { TreeNode } from '../types'

interface FolderTreeProps {
  root: TreeNode | null
  truncated: boolean
  currentPath: string | null
  expanded: Set<string>
  includeHtml: boolean
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}

interface RowProps {
  node: TreeNode
  depth: number
  currentPath: string | null
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}

function Row({ node, depth, currentPath, expanded, onToggle, onSelect }: RowProps) {
  const isOpen = expanded.has(node.path)
  const isCurrent = !node.is_dir && node.path === currentPath

  const handleClick = useCallback(() => {
    if (node.is_dir) {
      onToggle(node.path)
    } else {
      onSelect(node.path)
    }
  }, [node.is_dir, node.path, onSelect, onToggle])

  return (
    <>
      <button
        type="button"
        className="tree-item"
        style={{ paddingLeft: `${6 + depth * 13}px` }}
        aria-current={isCurrent}
        aria-expanded={node.is_dir ? isOpen : undefined}
        title={node.path}
        onClick={handleClick}
      >
        {node.is_dir ? (
          <span className="tree-twisty" data-open={isOpen} aria-hidden="true">
            ▶
          </span>
        ) : (
          <span className="tree-twisty" aria-hidden="true" />
        )}
        <span className="tree-icon" aria-hidden="true">
          {node.is_dir ? '📁' : '📄'}
        </span>
        <span className="tree-label">{node.name}</span>
      </button>

      {node.is_dir &&
        isOpen &&
        node.children.map((child) => (
          <Row
            key={child.path}
            node={child}
            depth={depth + 1}
            currentPath={currentPath}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  )
}

export function FolderTree({
  root,
  truncated,
  currentPath,
  expanded,
  includeHtml,
  onToggle,
  onSelect,
}: FolderTreeProps) {
  if (!root) {
    return <p className="empty-note">フォルダを開くとここに一覧が出ます。</p>
  }

  if (root.children.length === 0) {
    return (
      <p className="empty-note">
        {includeHtml
          ? 'このフォルダに Markdown / HTML はありません。'
          : 'このフォルダに Markdown はありません。'}
      </p>
    )
  }

  return (
    <>
      {truncated && (
        <p className="pane-note">
          ファイルが多いため一部だけ表示しています。
        </p>
      )}
      {root.children.map((child) => (
        <Row
          key={child.path}
          node={child}
          depth={0}
          currentPath={currentPath}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

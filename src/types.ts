export interface TreeNode {
  name: string
  path: string
  is_dir: boolean
  children: TreeNode[]
}

export interface TreeResult {
  root: TreeNode
  truncated: boolean
  entry_count: number
}

export interface DocumentPayload {
  path: string
  dir: string
  name: string
  content: string
  size: number
  modified: number | null
}

export interface PathKind {
  exists: boolean
  is_dir: boolean
  is_markdown: boolean
  path: string
}

export interface FsChange {
  paths: string[]
  structural: boolean
}

export interface TocItem {
  id: string
  text: string
  level: number
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

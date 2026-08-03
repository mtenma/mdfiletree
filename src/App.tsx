import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirm, open as openDialog, save } from '@tauri-apps/plugin-dialog'

import { DocumentView, type ScrollTarget } from './components/DocumentView'
import { FolderTree } from './components/FolderTree'
import { SearchBar } from './components/SearchBar'
import { Splitter } from './components/Splitter'
import { StatusBar } from './components/StatusBar'
import { TocPanel } from './components/TocPanel'
import { Toolbar } from './components/Toolbar'
import { WelcomeScreen } from './components/WelcomeScreen'
import { searchSupported, useSearch } from './hooks/useSearch'
import { buildStandaloneHtml } from './lib/export'
import {
  allowAssetDir,
  openInNewWindow,
  pathKind,
  printDocument,
  readDocument,
  revealInFinder,
  scanTree,
  setWindowDocument,
  startWatch,
  takePendingOpen,
  writeTextFile,
} from './lib/ipc'
import { MD_EXTS, basename, dirname, relativeTo } from './lib/paths'
import { offsetWithin, topmostHeadingId } from './markdown/dom'
import { renderMarkdown, type RenderResult } from './markdown/renderer'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  pushRecent,
  saveSettings,
  type Settings,
} from './lib/settings'
import type { DocumentPayload, FsChange, ResolvedTheme, TocItem, TreeResult } from './types'

/** これを超えたら描画前に確認する（重い文書で固まったように見えるのを防ぐ） */
const LARGE_FILE_BYTES = 2 * 1024 * 1024

const FONT_SCALE_MIN = 0.7
const FONT_SCALE_MAX = 2.2
const FONT_SCALE_STEP = 0.1

interface OpenDocument {
  payload: DocumentPayload
  result: RenderResult
  scrollTarget: ScrollTarget
}

interface History {
  stack: string[]
  index: number
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  const [tree, setTree] = useState<TreeResult | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const [current, setCurrent] = useState<OpenDocument | null>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const [activeHeading, setActiveHeading] = useState<string | null>(null)
  const [history, setHistory] = useState<History>({ stack: [], index: -1 })

  const [searchOpen, setSearchOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const theme: ResolvedTheme =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  // イベントリスナから最新値を読むための控え
  const currentRef = useRef<OpenDocument | null>(null)
  const folderRef = useRef<string | null>(null)
  const historyRef = useRef<History>({ stack: [], index: -1 })
  currentRef.current = current
  folderRef.current = folder
  historyRef.current = history

  const search = useSearch({
    bodyRef,
    scrollerRef,
    contentKey: current?.result.html ?? null,
  })

  /* ------------------------------------------------------------------ 設定 */

  useEffect(() => {
    void loadSettings().then((loaded) => {
      setSettings(loaded)
      setSettingsLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (settingsLoaded) saveSettings(settings)
  }, [settings, settingsLoaded])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(settings.fontScale))
  }, [settings.fontScale])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 2600)
    return () => window.clearTimeout(timer)
  }, [message])

  /* ------------------------------------------------------- 文書とフォルダ */

  /** 開いているファイルの位置までツリーを開く */
  const revealInTree = useCallback((filePath: string, root: string | null) => {
    if (!root) return
    setExpanded((previous) => {
      const next = new Set(previous)
      let dir = dirname(filePath)
      while (dir.startsWith(root) && dir !== root) {
        next.add(dir)
        dir = dirname(dir)
      }
      return next
    })
  }, [])

  const loadDocument = useCallback(
    async (
      path: string,
      options: { scrollTarget?: ScrollTarget; pushHistory?: boolean } = {},
    ): Promise<void> => {
      try {
        const payload = await readDocument(path)

        if (payload.size > LARGE_FILE_BYTES) {
          const proceed = await confirm(
            `${payload.name} は ${(payload.size / 1024 / 1024).toFixed(1)} MB あります。表示に時間がかかることがあります。`,
            { title: '大きなファイル', kind: 'warning' },
          )
          if (!proceed) return
        }

        const result = renderMarkdown(payload.content)

        setCurrent({
          payload,
          result,
          scrollTarget: options.scrollTarget ?? { kind: 'top' },
        })
        setError(null)

        if (options.pushHistory !== false) {
          setHistory((previous) => {
            if (previous.stack[previous.index] === path) return previous
            const stack = [...previous.stack.slice(0, previous.index + 1), path].slice(-60)
            return { stack, index: stack.length - 1 }
          })
        }

        setSettings((previous) => ({
          ...previous,
          lastFile: path,
          recentFiles: pushRecent(previous.recentFiles, path),
        }))

        revealInTree(path, folderRef.current)
      } catch (caught) {
        setError(describeError(caught))
      }
    },
    [revealInTree],
  )

  const openFolder = useCallback(async (path: string): Promise<void> => {
    try {
      const scanned = await scanTree(path)
      setTree(scanned)
      setFolder(scanned.root.path)
      setError(null)

      await allowAssetDir(scanned.root.path)
      await startWatch(scanned.root.path)

      setSettings((previous) => ({
        ...previous,
        lastFolder: scanned.root.path,
        recentFolders: pushRecent(previous.recentFolders, scanned.root.path),
      }))
    } catch (caught) {
      setError(describeError(caught))
    }
  }, [])

  /** ファイル / フォルダのどちらを渡されても適切に開く */
  const openPath = useCallback(
    async (path: string): Promise<void> => {
      try {
        const kind = await pathKind(path)

        if (!kind.exists) {
          setError(`見つかりません: ${path}`)
          return
        }

        if (kind.is_dir) {
          await openFolder(kind.path)
          return
        }

        // 単体のファイルを開いたときも、その入れ物をツリーに出しておく
        if (!folderRef.current) {
          await openFolder(dirname(kind.path))
        } else {
          await allowAssetDir(dirname(kind.path))
        }

        await loadDocument(kind.path)
      } catch (caught) {
        setError(describeError(caught))
      }
    },
    [loadDocument, openFolder],
  )

  /**
   * Finder などから渡されたパスを開く。
   * 1つ目はこのウィンドウで、2つ目以降はそれぞれ別のウィンドウで開く。
   */
  const openHandedPaths = useCallback(
    async (paths: string[]): Promise<void> => {
      const [first, ...rest] = paths
      if (!first) return

      await openPath(first)
      for (const path of rest) {
        await openInNewWindow(path).catch((caught) => setError(describeError(caught)))
      }
    },
    [openPath],
  )

  const reloadCurrent = useCallback(() => {
    const openDoc = currentRef.current
    if (!openDoc) return

    const scroller = scrollerRef.current
    const body = bodyRef.current
    const headingId = body && scroller ? topmostHeadingId(body, scroller) : null

    void loadDocument(openDoc.payload.path, {
      pushHistory: false,
      scrollTarget: {
        kind: 'restore',
        headingId,
        offset: scroller?.scrollTop ?? 0,
      },
    })
  }, [loadDocument])

  // 開いている文書をウィンドウのタイトルに出し、Rust 側にも伝える。
  // ウィンドウを並べたときにどれがどのファイルか分かるようにするためと、
  // 同じファイルを Finder から開き直したときにウィンドウを増やさないため。
  useEffect(() => {
    const path = current?.payload.path ?? null
    void getCurrentWindow().setTitle(current?.payload.name ?? 'MDFileTree')
    void setWindowDocument(path)
  }, [current?.payload.name, current?.payload.path])

  /* ------------------------------------------------------------ 起動時処理 */

  useEffect(() => {
    if (!settingsLoaded) return

    let cancelled = false

    const bootstrap = async () => {
      const pending = await takePendingOpen()
      if (cancelled) return

      if (pending.length > 0) {
        await openHandedPaths(pending)
        return
      }

      // 前回の続きから開く
      if (settings.lastFolder) {
        await openFolder(settings.lastFolder)
      }
      if (!cancelled && settings.lastFile) {
        await loadDocument(settings.lastFile)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
    // 起動時に一度だけ実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded])

  /* -------------------------------------------------------- Tauri イベント */

  useEffect(() => {
    const unlisten = listen('pending-open', async () => {
      await openHandedPaths(await takePendingOpen())
    })
    return () => {
      void unlisten.then((off) => off())
    }
  }, [openHandedPaths])

  useEffect(() => {
    const unlisten = listen<FsChange>('fs-changed', (event) => {
      const { paths, structural } = event.payload

      const openPathValue = currentRef.current?.payload.path
      if (openPathValue && paths.includes(openPathValue)) {
        reloadCurrent()
      }

      const root = folderRef.current
      if (structural && root) {
        void scanTree(root)
          .then(setTree)
          .catch(() => {
            /* 走査に失敗しても表示中の文書には影響しない */
          })
      }
    })

    return () => {
      void unlisten.then((off) => off())
    }
  }, [reloadCurrent])

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') {
        setDropActive(true)
      } else if (event.payload.type === 'leave') {
        setDropActive(false)
      } else if (event.payload.type === 'drop') {
        setDropActive(false)
        const [first] = event.payload.paths
        if (first) void openPath(first)
      }
    })

    return () => {
      void unlisten.then((off) => off())
    }
  }, [openPath])

  /* -------------------------------------------------------------- 各種操作 */

  const goHistory = useCallback(
    (delta: number) => {
      const { stack, index } = historyRef.current
      const nextIndex = index + delta
      if (nextIndex < 0 || nextIndex >= stack.length) return

      setHistory({ stack, index: nextIndex })
      void loadDocument(stack[nextIndex], { pushHistory: false })
    },
    [loadDocument],
  )

  const pickFolder = useCallback(async () => {
    try {
      const picked = await openDialog({ directory: true, multiple: false, title: 'フォルダを開く' })
      if (typeof picked === 'string') await openFolder(picked)
    } catch (caught) {
      setError(`フォルダを選べませんでした: ${describeError(caught)}`)
    }
  }, [openFolder])

  const pickFile = useCallback(async () => {
    try {
      const picked = await openDialog({
        multiple: false,
        title: 'ファイルを開く',
        filters: [
          { name: 'Markdown', extensions: [...MD_EXTS, 'txt'] },
          { name: 'すべてのファイル', extensions: ['*'] },
        ],
      })
      if (typeof picked === 'string') await openPath(picked)
    } catch (caught) {
      setError(`ファイルを選べませんでした: ${describeError(caught)}`)
    }
  }, [openPath])

  const setFontScale = useCallback((next: number) => {
    setSettings((previous) => ({
      ...previous,
      fontScale: Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Number(next.toFixed(2)))),
    }))
  }, [])

  const handleExport = useCallback(async () => {
    const body = bodyRef.current
    const openDoc = currentRef.current
    if (!body || !openDoc) return

    try {
      const stem = openDoc.payload.name.replace(/\.[^.]+$/, '')
      const target = await save({
        title: 'HTML として書き出す',
        defaultPath: `${stem}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      })
      if (!target) return

      setMessage('書き出しています…')
      const html = await buildStandaloneHtml({
        container: body,
        title: stem,
        theme,
        fontScale: settings.fontScale,
      })
      await writeTextFile(target, html)
      setMessage(`書き出しました: ${basename(target)}`)
    } catch (caught) {
      setError(describeError(caught))
    }
  }, [settings.fontScale, theme])

  const handlePrint = useCallback(async () => {
    try {
      await printDocument()
    } catch (caught) {
      setError(describeError(caught))
    }
  }, [])

  const handleReveal = useCallback(() => {
    const path = currentRef.current?.payload.path
    if (!path) return
    void revealInFinder(path).catch((caught) => setError(describeError(caught)))
  }, [])

  const openSearch = useCallback(() => setSearchOpen(true), [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    search.reset()
  }, [search])

  // scrollIntoView は祖先まで巻き込んで動くことがあるので、本文の入れ物を直接動かす
  const scrollToHeading = useCallback((id: string) => {
    const body = bodyRef.current
    const scroller = scrollerRef.current
    if (!body || !scroller) return

    const heading = body.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    if (!heading) return

    scroller.scrollTo({ top: Math.max(0, offsetWithin(heading, scroller) - 12), behavior: 'smooth' })
  }, [])

  const toggleTree = useCallback(
    () => setSettings((previous) => ({ ...previous, treeVisible: !previous.treeVisible })),
    [],
  )

  const toggleToc = useCallback(
    () => setSettings((previous) => ({ ...previous, tocVisible: !previous.tocVisible })),
    [],
  )

  const toggleTheme = useCallback(
    () =>
      setSettings((previous) => ({
        ...previous,
        theme:
          previous.theme === 'dark'
            ? 'light'
            : previous.theme === 'light'
              ? 'dark'
              : systemDark
                ? 'light'
                : 'dark',
      })),
    [systemDark],
  )

  /* ------------------------------------------------- メニューとキーボード */

  const runAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'open-folder':
          void pickFolder()
          break
        case 'open-file':
          void pickFile()
          break
        case 'reveal':
          handleReveal()
          break
        case 'export-html':
          void handleExport()
          break
        case 'print':
          void handlePrint()
          break
        case 'find':
          openSearch()
          break
        case 'find-next':
          search.next()
          break
        case 'find-prev':
          search.previous()
          break
        case 'toggle-tree':
          toggleTree()
          break
        case 'toggle-toc':
          toggleToc()
          break
        case 'toggle-theme':
          toggleTheme()
          break
        case 'zoom-in':
          setFontScale(settings.fontScale + FONT_SCALE_STEP)
          break
        case 'zoom-out':
          setFontScale(settings.fontScale - FONT_SCALE_STEP)
          break
        case 'zoom-reset':
          setFontScale(1)
          break
        case 'go-back':
          goHistory(-1)
          break
        case 'go-forward':
          goHistory(1)
          break
        default:
          break
      }
    },
    [
      goHistory,
      handleExport,
      handlePrint,
      handleReveal,
      openSearch,
      pickFile,
      pickFolder,
      search,
      setFontScale,
      settings.fontScale,
      toggleTheme,
      toggleToc,
      toggleTree,
    ],
  )

  useEffect(() => {
    const unlisten = listen<string>('menu-action', (event) => runAction(event.payload))
    return () => {
      void unlisten.then((off) => off())
    }
  }, [runAction])

  // 本文のスクロールは自前で処理する。
  // 本文の入れ物は div なので、webview 任せだとキー操作でスクロールしないことがある。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const scroller = scrollerRef.current
      if (!scroller) return

      // 入力中は文字入力を優先する
      const active = document.activeElement
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      ) {
        return
      }

      const page = Math.max(120, scroller.clientHeight - 80)
      const deltas: Record<string, number> = {
        PageDown: page,
        PageUp: -page,
        ArrowDown: 72,
        ArrowUp: -72,
      }

      if (event.key === ' ') {
        event.preventDefault()
        scroller.scrollBy({ top: event.shiftKey ? -page : page })
        return
      }

      if (event.key === 'Home') {
        event.preventDefault()
        scroller.scrollTo({ top: 0 })
        return
      }

      if (event.key === 'End') {
        event.preventDefault()
        scroller.scrollTo({ top: scroller.scrollHeight })
        return
      }

      const delta = deltas[event.key]
      if (delta === undefined) return
      event.preventDefault()
      scroller.scrollBy({ top: delta })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // メニューのショートカットが解釈されなかった場合の受け皿。
  // 解釈できていれば macOS のメニューが先に処理するので、ここには届かない。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && searchOpen) {
        event.preventDefault()
        closeSearch()
        return
      }

      if (!event.metaKey || event.ctrlKey || event.altKey) return

      const map: Record<string, string> = {
        f: 'find',
        g: event.shiftKey ? 'find-prev' : 'find-next',
        '\\': 'toggle-tree',
        '=': 'zoom-in',
        '+': 'zoom-in',
        '-': 'zoom-out',
        '0': 'zoom-reset',
        '[': 'go-back',
        ']': 'go-forward',
        e: 'export-html',
        p: 'print',
      }

      const action = map[event.key.toLowerCase()]
      if (!action) return
      event.preventDefault()
      runAction(action)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeSearch, runAction, searchOpen])

  /* ----------------------------------------------------------------- 描画 */

  const handleTreeToggle = useCallback((path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleOpenDoc = useCallback(
    (path: string, hash?: string) => {
      void loadDocument(path, {
        scrollTarget: hash ? { kind: 'anchor', id: hash } : { kind: 'top' },
      })
    },
    [loadDocument],
  )

  const relativePath = useMemo(() => {
    if (!current) return null
    return folder ? relativeTo(folder, current.payload.path) : current.payload.path
  }, [current, folder])

  const hasDocument = current !== null

  return (
    <div className="app">
      <Toolbar
        title={current?.payload.name ?? 'MDFileTree'}
        path={current ? current.payload.path : null}
        theme={theme}
        treeVisible={settings.treeVisible}
        tocVisible={settings.tocVisible}
        canGoBack={history.index > 0}
        canGoForward={history.index >= 0 && history.index < history.stack.length - 1}
        hasDocument={hasDocument}
        onBack={() => goHistory(-1)}
        onForward={() => goHistory(1)}
        onOpenFolder={() => void pickFolder()}
        onOpenFile={() => void pickFile()}
        onToggleTree={toggleTree}
        onToggleToc={toggleToc}
        onToggleTheme={toggleTheme}
        onFind={openSearch}
        onZoomIn={() => setFontScale(settings.fontScale + FONT_SCALE_STEP)}
        onZoomOut={() => setFontScale(settings.fontScale - FONT_SCALE_STEP)}
        onZoomReset={() => setFontScale(1)}
        onExport={() => void handleExport()}
        onPrint={() => void handlePrint()}
      />

      <div className="panes">
        {settings.treeVisible && (
          <>
            <nav
              className="pane pane-tree"
              style={{ ['--tree-width' as string]: `${settings.treeWidth}px` }}
              aria-label="フォルダ"
            >
              <div className="pane-head">
                <span>{folder ? basename(folder) : 'フォルダ'}</span>
                <button
                  type="button"
                  className="tool-button"
                  style={{ height: 20, minWidth: 22, fontSize: 12 }}
                  title="フォルダを開く (⌘⇧O)"
                  aria-label="フォルダを開く"
                  onClick={() => void pickFolder()}
                >
                  📂
                </button>
              </div>
              <div className="pane-body">
                <FolderTree
                  root={tree?.root ?? null}
                  truncated={tree?.truncated ?? false}
                  currentPath={current?.payload.path ?? null}
                  expanded={expanded}
                  onToggle={handleTreeToggle}
                  onSelect={(path) => void loadDocument(path)}
                />
              </div>
            </nav>
            <Splitter
              width={settings.treeWidth}
              min={160}
              max={520}
              label="フォルダの幅"
              onChange={(width) => setSettings((previous) => ({ ...previous, treeWidth: width }))}
              onCommit={(width) => setSettings((previous) => ({ ...previous, treeWidth: width }))}
            />
          </>
        )}

        {settings.tocVisible && (
          <>
            <nav
              className="pane pane-toc"
              style={{ ['--toc-width' as string]: `${settings.tocWidth}px` }}
              aria-label="目次"
            >
              <div className="pane-head">
                <span>目次</span>
              </div>
              <div className="pane-body">
                <TocPanel items={toc} activeId={activeHeading} onSelect={scrollToHeading} />
              </div>
            </nav>
            <Splitter
              width={settings.tocWidth}
              min={140}
              max={460}
              label="目次の幅"
              onChange={(width) => setSettings((previous) => ({ ...previous, tocWidth: width }))}
              onCommit={(width) => setSettings((previous) => ({ ...previous, tocWidth: width }))}
            />
          </>
        )}

        <main className="pane-content" ref={scrollerRef}>
          {searchOpen && (
            <SearchBar
              query={search.query}
              total={search.total}
              index={search.index}
              supported={searchSupported}
              onQueryChange={search.setQuery}
              onNext={search.next}
              onPrevious={search.previous}
              onClose={closeSearch}
            />
          )}

          {current ? (
            <DocumentView
              result={current.result}
              docDir={current.payload.dir}
              theme={theme}
              scrollTarget={current.scrollTarget}
              scrollerRef={scrollerRef}
              bodyRef={bodyRef}
              onToc={setToc}
              onActiveHeading={setActiveHeading}
              onOpenDoc={handleOpenDoc}
              onError={setError}
            />
          ) : (
            <WelcomeScreen
              recentFolders={settings.recentFolders}
              recentFiles={settings.recentFiles}
              onOpenFolder={() => void pickFolder()}
              onOpenFile={() => void pickFile()}
              onSelectFolder={(path) => void openFolder(path)}
              onSelectFile={(path) => void openPath(path)}
            />
          )}
        </main>
      </div>

      <StatusBar
        path={relativePath}
        size={current?.payload.size ?? null}
        modified={current?.payload.modified ?? null}
        headingCount={toc.length}
        message={message}
        error={error}
        onReveal={handleReveal}
      />

      {dropActive && <div className="drop-overlay">ここにドロップして開く</div>}
    </div>
  )
}

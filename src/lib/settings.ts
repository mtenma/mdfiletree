import { load, type Store } from '@tauri-apps/plugin-store'
import type { ThemeMode } from '../types'

export interface Settings {
  theme: ThemeMode
  fontScale: number
  treeVisible: boolean
  tocVisible: boolean
  treeWidth: number
  tocWidth: number
  /** HTML ファイル（.html / .htm）を表示対象に含めるか */
  includeHtml: boolean
  lastFolder: string | null
  lastFile: string | null
  recentFolders: string[]
  recentFiles: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontScale: 1,
  treeVisible: true,
  tocVisible: true,
  treeWidth: 260,
  tocWidth: 240,
  includeHtml: false,
  lastFolder: null,
  lastFile: null,
  recentFolders: [],
  recentFiles: [],
}

export const MAX_RECENT = 12

const STORE_FILE = 'settings.json'

let storePromise: Promise<Store> | null = null

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: false })
  }
  return storePromise
}

export async function loadSettings(): Promise<Settings> {
  try {
    const store = await getStore()
    const saved = await store.get<Partial<Settings>>('settings')
    return { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
  } catch (error) {
    console.warn('設定を読み込めませんでした', error)
    return { ...DEFAULT_SETTINGS }
  }
}

let saveTimer: number | undefined

/** 連続した更新をまとめて書き出す */
export function saveSettings(settings: Settings): void {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    try {
      const store = await getStore()
      await store.set('settings', settings)
      await store.save()
    } catch (error) {
      console.warn('設定を保存できませんでした', error)
    }
  }, 400)
}

/** 最近使った一覧の先頭に追加する（重複は取り除く） */
export function pushRecent(list: string[], value: string): string[] {
  return [value, ...list.filter((item) => item !== value)].slice(0, MAX_RECENT)
}

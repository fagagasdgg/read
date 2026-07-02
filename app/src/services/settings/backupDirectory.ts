import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { FilePicker } from '@capawesome/capacitor-file-picker'

export interface BackupDirectorySettings {
  /** 用于界面展示的路径或目录名 */
  displayPath: string
  /** Android / iOS 由系统返回的目录路径 */
  nativePath: string
  /** 浏览器 File System Access API 目录名 */
  webDirectoryName: string
  updatedAt: number
}

const STORAGE_KEY = 'read-backup-directory'

const DEFAULT_SETTINGS: BackupDirectorySettings = {
  displayPath: '',
  nativePath: '',
  webDirectoryName: '',
  updatedAt: 0,
}

export function formatBackupDirectoryLabel(settings: BackupDirectorySettings): string {
  if (settings.displayPath) return settings.displayPath
  return '未设置（后续导入/导出时将提示选择）'
}

export async function loadBackupDirectorySettings(): Promise<BackupDirectorySettings> {
  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(STORAGE_KEY)
    }

    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<BackupDirectorySettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveBackupDirectorySettings(
  settings: BackupDirectorySettings,
): Promise<void> {
  const payload = JSON.stringify(settings)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
    return
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

export async function clearBackupDirectorySettings(): Promise<BackupDirectorySettings> {
  const cleared = { ...DEFAULT_SETTINGS }
  await saveBackupDirectorySettings(cleared)
  return cleared
}

export async function pickBackupDirectory(): Promise<BackupDirectorySettings | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await FilePicker.pickDirectory()
      if (!result.path) return null

      const next: BackupDirectorySettings = {
        displayPath: result.path,
        nativePath: result.path,
        webDirectoryName: '',
        updatedAt: Date.now(),
      }
      await saveBackupDirectorySettings(next)
      return next
    }

    if ('showDirectoryPicker' in window) {
      const handle = await (
        window as Window & {
          showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>
        }
      ).showDirectoryPicker()

      const next: BackupDirectorySettings = {
        displayPath: handle.name,
        nativePath: '',
        webDirectoryName: handle.name,
        updatedAt: Date.now(),
      }
      await saveBackupDirectorySettings(next)
      return next
    }

    throw new Error('当前环境不支持选择文件夹，请在 Android 应用中使用')
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { ScopedStorage, type FolderRef } from '@daniele-rolli/capacitor-scoped-storage'

export interface BackupDirectorySettings {
  displayPath: string
  /** 兼容旧版 FilePicker 路径 */
  nativePath: string
  /** ScopedStorage 文件夹引用 id（Android tree URI） */
  folderId: string
  folderName: string
  webDirectoryName: string
  updatedAt: number
}

const STORAGE_KEY = 'read-backup-directory'

const DEFAULT_SETTINGS: BackupDirectorySettings = {
  displayPath: '',
  nativePath: '',
  folderId: '',
  folderName: '',
  webDirectoryName: '',
  updatedAt: 0,
}

/** 将 Android content:// 树形 URI 转为可读路径 */
export function formatBackupDirectoryPathForDisplay(rawPath: string): string {
  if (!rawPath) return ''

  try {
    const decoded = decodeURIComponent(rawPath)
    if (decoded.startsWith('content://')) {
      const treeMatch = decoded.match(/\/tree\/([^/]+)/)
      if (treeMatch?.[1]) {
        const segment = treeMatch[1].replace(/^primary:/i, '内部存储/')
        return segment.replace(/:/g, '/')
      }
      return decoded.replace(/^content:\/\/[^/]+\//, '')
    }
    return decoded
  } catch {
    return rawPath
  }
}

export function formatBackupDirectoryLabel(settings: BackupDirectorySettings): string {
  if (settings.folderName && !settings.folderName.startsWith('content://')) {
    return settings.folderName
  }
  const readable =
    settings.displayPath && !settings.displayPath.startsWith('content://')
      ? settings.displayPath
      : formatBackupDirectoryPathForDisplay(settings.folderId || settings.nativePath)
  if (readable) return readable
  return '未设置（导出时将保存到 Documents/read-backups）'
}

export function resolveBackupFolder(settings: BackupDirectorySettings): FolderRef | null {
  if (settings.folderId) {
    return { id: settings.folderId, name: settings.folderName || settings.displayPath }
  }
  if (settings.nativePath.startsWith('content://')) {
    return { id: settings.nativePath, name: settings.displayPath || settings.folderName }
  }
  return null
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
      const { folder } = await ScopedStorage.pickFolder()
      if (!folder?.id) return null

      const display =
        folder.name?.trim() ||
        formatBackupDirectoryPathForDisplay(folder.id) ||
        '已选文件夹'

      const next: BackupDirectorySettings = {
        displayPath: display,
        nativePath: folder.id,
        folderId: folder.id,
        folderName: display,
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
        folderId: '',
        folderName: handle.name,
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

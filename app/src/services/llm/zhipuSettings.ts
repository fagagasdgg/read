import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export interface ZhipuSettings {
  apiKey: string
  model: string
  updatedAt: number
}

const STORAGE_KEY = 'read-zhipu-settings'

/** 智谱免费 Flash 模型 */
export const ZHIPU_DEFAULT_MODEL = 'glm-4.5-flash'

const DEFAULT_SETTINGS: ZhipuSettings = {
  apiKey: '',
  model: ZHIPU_DEFAULT_MODEL,
  updatedAt: 0,
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return '未配置'
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`
}

async function readSettings(): Promise<ZhipuSettings> {
  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(STORAGE_KEY)
    }
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<ZhipuSettings>
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '',
      model:
        typeof parsed.model === 'string' && parsed.model.trim()
          ? parsed.model.trim()
          : ZHIPU_DEFAULT_MODEL,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function writeSettings(settings: ZhipuSettings): Promise<void> {
  const payload = JSON.stringify(settings)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
    return
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

export async function loadZhipuSettings(): Promise<ZhipuSettings> {
  return readSettings()
}

export async function saveZhipuSettings(partial: Partial<ZhipuSettings>): Promise<ZhipuSettings> {
  const current = await readSettings()
  const next: ZhipuSettings = {
    apiKey: partial.apiKey !== undefined ? partial.apiKey.trim() : current.apiKey,
    model:
      partial.model !== undefined
        ? partial.model.trim() || ZHIPU_DEFAULT_MODEL
        : current.model,
    updatedAt: Date.now(),
  }
  await writeSettings(next)
  return next
}

export async function getZhipuApiKey(): Promise<string> {
  const settings = await readSettings()
  return settings.apiKey
}

export async function hasZhipuApiKey(): Promise<boolean> {
  const key = await getZhipuApiKey()
  return Boolean(key)
}

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export type LlmProvider = 'zhipu' | 'doubao'

export interface LlmProviderSettings {
  provider: LlmProvider
  updatedAt: number
}

const STORAGE_KEY = 'read-llm-provider'

const DEFAULT_SETTINGS: LlmProviderSettings = {
  provider: 'zhipu',
  updatedAt: 0,
}

async function readSettings(): Promise<LlmProviderSettings> {
  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(STORAGE_KEY)
    }
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<LlmProviderSettings>
    const provider = parsed.provider === 'doubao' ? 'doubao' : 'zhipu'
    return {
      provider,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function writeSettings(settings: LlmProviderSettings): Promise<void> {
  const payload = JSON.stringify(settings)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
    return
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

export async function loadLlmProviderSettings(): Promise<LlmProviderSettings> {
  return readSettings()
}

export async function saveLlmProvider(provider: LlmProvider): Promise<LlmProviderSettings> {
  const next: LlmProviderSettings = { provider, updatedAt: Date.now() }
  await writeSettings(next)
  return next
}

export function getLlmProviderLabel(provider: LlmProvider): string {
  return provider === 'doubao' ? '豆包 API' : '智谱 AI'
}

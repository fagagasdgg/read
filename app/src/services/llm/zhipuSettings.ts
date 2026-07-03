import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export interface ZhipuModelOption {
  id: string
  label: string
  hint?: string
}

export interface ZhipuSettings {
  apiKey: string
  model: string
  updatedAt: number
}

const STORAGE_KEY = 'read-zhipu-settings'

/** 智谱控制台「免费模型」中文本解析适用项 */
export const ZHIPU_FREE_MODELS: ZhipuModelOption[] = [
  { id: 'glm-4.7-flash', label: 'GLM-4.7-Flash', hint: '推荐，最新免费 Flash' },
  { id: 'glm-4-flash-250414', label: 'GLM-4-Flash-250414', hint: '稳定兜底' },
  { id: 'glm-4.6v-flash', label: 'GLM-4.6V-Flash', hint: '多模态，纯文本也可用' },
  { id: 'glm-4.1v-thinking-flash', label: 'GLM-4.1V-Thinking-Flash', hint: '偏复杂推理，较慢' },
  { id: 'glm-4v-flash', label: 'GLM-4V-Flash', hint: '多模态' },
]

export const ZHIPU_DEFAULT_MODEL = 'glm-4.7-flash'

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'glm-4.5-flash': 'glm-4.7-flash',
}

const DEFAULT_SETTINGS: ZhipuSettings = {
  apiKey: '',
  model: ZHIPU_DEFAULT_MODEL,
  updatedAt: 0,
}

export function normalizeZhipuModel(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) return ZHIPU_DEFAULT_MODEL
  return LEGACY_MODEL_ALIASES[trimmed] ?? trimmed
}

export function getZhipuModelLabel(modelId: string): string {
  const normalized = normalizeZhipuModel(modelId)
  return ZHIPU_FREE_MODELS.find((item) => item.id === normalized)?.label ?? normalized
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
      model: normalizeZhipuModel(typeof parsed.model === 'string' ? parsed.model : ''),
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
        ? normalizeZhipuModel(partial.model)
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

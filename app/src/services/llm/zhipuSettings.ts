import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export interface ZhipuModelOption {
  id: string
  label: string
  hint?: string
  /** API max_tokens 上限 */
  maxOutputTokens: number
  /** 上下文窗口（约） */
  contextTokens: number
  /** 建议单次选段英文字数 */
  suggestMaxWords: number
  /** 是否默认开启 thinking */
  thinkingDefault?: boolean
  /** 实测可用 */
  verified?: boolean
}

export interface ZhipuSettings {
  apiKey: string
  model: string
  customModels: ZhipuModelOption[]
  updatedAt: number
}

const STORAGE_KEY = 'read-zhipu-settings'

/** 智谱免费模型（含输出 token 上限，以官方限制为准） */
export const ZHIPU_FREE_MODELS: ZhipuModelOption[] = [
  {
    id: 'glm-4-flash-250414',
    label: 'GLM-4-Flash-250414',
    hint: '稳定可用，推荐默认',
    maxOutputTokens: 1024,
    contextTokens: 128_000,
    suggestMaxWords: 600,
    verified: true,
  },
  {
    id: 'glm-4.1v-thinking-flash',
    label: 'GLM-4.1V-Thinking-Flash',
    hint: '支持思考链，输出上限 1024',
    maxOutputTokens: 1024,
    contextTokens: 64_000,
    suggestMaxWords: 400,
    thinkingDefault: true,
    verified: true,
  },
  {
    id: 'glm-4v-flash',
    label: 'GLM-4V-Flash',
    hint: '多模态，纯文本可用',
    maxOutputTokens: 1024,
    contextTokens: 128_000,
    suggestMaxWords: 600,
    verified: true,
  },
  {
    id: 'glm-4.7-flash',
    label: 'GLM-4.7-Flash',
    hint: '可能限流，繁忙时请换 250414',
    maxOutputTokens: 1024,
    contextTokens: 128_000,
    suggestMaxWords: 600,
  },
  {
    id: 'glm-4.6v-flash',
    label: 'GLM-4.6V-Flash',
    hint: '可能限流',
    maxOutputTokens: 1024,
    contextTokens: 128_000,
    suggestMaxWords: 600,
  },
]

export const ZHIPU_DEFAULT_MODEL = 'glm-4-flash-250414'

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'glm-4.5-flash': 'glm-4-flash-250414',
}

const DEFAULT_CUSTOM_MODEL_SPECS = {
  maxOutputTokens: 1024,
  contextTokens: 128_000,
  suggestMaxWords: 600,
} as const

const DEFAULT_SETTINGS: ZhipuSettings = {
  apiKey: '',
  model: ZHIPU_DEFAULT_MODEL,
  customModels: [],
  updatedAt: 0,
}

function isBuiltInModel(id: string): boolean {
  return ZHIPU_FREE_MODELS.some((item) => item.id === id)
}

export function getAllZhipuModels(customModels: ZhipuModelOption[] = []): ZhipuModelOption[] {
  const builtinIds = new Set(ZHIPU_FREE_MODELS.map((item) => item.id))
  const extras = customModels.filter((item) => !builtinIds.has(item.id))
  return [...ZHIPU_FREE_MODELS, ...extras]
}

export function getZhipuModelOption(
  modelId: string,
  customModels: ZhipuModelOption[] = [],
): ZhipuModelOption | undefined {
  const normalized = normalizeZhipuModel(modelId)
  return getAllZhipuModels(customModels).find((item) => item.id === normalized)
}

export function isCustomZhipuModel(modelId: string, customModels: ZhipuModelOption[]): boolean {
  const normalized = normalizeZhipuModel(modelId)
  return customModels.some((item) => item.id === normalized)
}

export function normalizeZhipuModel(model: string): string {
  const trimmed = model.trim().toLowerCase()
  if (!trimmed) return ZHIPU_DEFAULT_MODEL
  return LEGACY_MODEL_ALIASES[trimmed] ?? trimmed
}

export function getZhipuModelLabel(modelId: string, customModels: ZhipuModelOption[] = []): string {
  return getZhipuModelOption(modelId, customModels)?.label ?? modelId
}

export function countEnglishWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function estimateSelectionTooLong(
  text: string,
  modelId: string,
  customModels: ZhipuModelOption[] = [],
): string | null {
  const option = getZhipuModelOption(modelId, customModels)
  if (!option) return null
  const words = countEnglishWords(text)
  if (words <= option.suggestMaxWords) return null
  return `当前选段约 ${words} 词，建议不超过 ${option.suggestMaxWords} 词（模型上下文 ${formatTokenCount(option.contextTokens)}）`
}

function formatTokenCount(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}K`
  return String(value)
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
    const parsed = JSON.parse(raw) as Partial<ZhipuSettings> & { customModels?: unknown }
    const customModels = normalizeCustomModels(parsed.customModels)
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '',
      model: normalizeZhipuModel(typeof parsed.model === 'string' ? parsed.model : ''),
      customModels,
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
      partial.model !== undefined ? normalizeZhipuModel(partial.model) : current.model,
    customModels:
      partial.customModels !== undefined
        ? normalizeCustomModels(partial.customModels)
        : current.customModels,
    updatedAt: Date.now(),
  }
  await writeSettings(next)
  return next
}

function normalizeCustomModels(value: unknown): ZhipuModelOption[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: ZhipuModelOption[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Partial<ZhipuModelOption>
    const id = typeof raw.id === 'string' ? normalizeZhipuModel(raw.id) : ''
    if (!id || seen.has(id) || isBuiltInModel(id)) continue
    seen.add(id)
    result.push({
      id,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : id,
      hint: '自定义模型',
      maxOutputTokens:
        typeof raw.maxOutputTokens === 'number' ? raw.maxOutputTokens : DEFAULT_CUSTOM_MODEL_SPECS.maxOutputTokens,
      contextTokens:
        typeof raw.contextTokens === 'number' ? raw.contextTokens : DEFAULT_CUSTOM_MODEL_SPECS.contextTokens,
      suggestMaxWords:
        typeof raw.suggestMaxWords === 'number' ? raw.suggestMaxWords : DEFAULT_CUSTOM_MODEL_SPECS.suggestMaxWords,
    })
  }
  return result
}

export async function addCustomZhipuModel(modelId: string, label?: string): Promise<ZhipuSettings> {
  const id = normalizeZhipuModel(modelId)
  if (!id) throw new Error('请填写模型 ID')
  if (isBuiltInModel(id)) throw new Error('该模型已在内置列表中')
  const current = await readSettings()
  if (current.customModels.some((item) => item.id === id)) {
    throw new Error('该自定义模型已存在')
  }
  const nextModel: ZhipuModelOption = {
    id,
    label: label?.trim() || id,
    hint: '自定义模型',
    ...DEFAULT_CUSTOM_MODEL_SPECS,
  }
  return saveZhipuSettings({
    customModels: [...current.customModels, nextModel],
    model: id,
  })
}

export async function removeCustomZhipuModel(modelId: string): Promise<ZhipuSettings> {
  const id = normalizeZhipuModel(modelId)
  const current = await readSettings()
  const customModels = current.customModels.filter((item) => item.id !== id)
  const model =
    current.model === id
      ? customModels[0]?.id ?? ZHIPU_DEFAULT_MODEL
      : current.model
  return saveZhipuSettings({ customModels, model })
}

export async function getZhipuApiKey(): Promise<string> {
  const settings = await readSettings()
  return settings.apiKey
}

export async function hasZhipuApiKey(): Promise<boolean> {
  const key = await getZhipuApiKey()
  return Boolean(key)
}

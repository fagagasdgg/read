import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { countEnglishWords, maskApiKey } from './zhipuSettings'

export interface DoubaoModelOption {
  id: string
  label: string
  hint?: string
  maxOutputTokens: number
  contextTokens: number
  suggestMaxWords: number
  verified?: boolean
}

export interface DoubaoSettings {
  apiKey: string
  model: string
  customModels: DoubaoModelOption[]
  hiddenModelIds: string[]
  updatedAt: number
}

const STORAGE_KEY = 'read-doubao-settings'

/** 火山方舟豆包模型（OpenAI 兼容接口） */
export const DOUBAO_BUILTIN_MODELS: DoubaoModelOption[] = [
  {
    id: 'doubao-lite-32k-240828',
    label: 'Doubao Lite 32K',
    hint: '轻量快速，适合短句',
    maxOutputTokens: 4096,
    contextTokens: 32_000,
    suggestMaxWords: 800,
    verified: true,
  },
  {
    id: 'doubao-pro-32k-240828',
    label: 'Doubao Pro 32K',
    hint: '质量更好，推荐默认',
    maxOutputTokens: 4096,
    contextTokens: 32_000,
    suggestMaxWords: 800,
    verified: true,
  },
  {
    id: 'doubao-1-5-lite-32k-250115',
    label: 'Doubao 1.5 Lite 32K',
    hint: '1.5 轻量版',
    maxOutputTokens: 4096,
    contextTokens: 32_000,
    suggestMaxWords: 800,
  },
  {
    id: 'doubao-1-5-pro-32k-250115',
    label: 'Doubao 1.5 Pro 32K',
    hint: '1.5 增强版',
    maxOutputTokens: 4096,
    contextTokens: 32_000,
    suggestMaxWords: 800,
  },
]

export const DOUBAO_DEFAULT_MODEL = 'doubao-pro-32k-240828'

const DEFAULT_CUSTOM_MODEL_SPECS = {
  maxOutputTokens: 4096,
  contextTokens: 32_000,
  suggestMaxWords: 800,
} as const

const DEFAULT_SETTINGS: DoubaoSettings = {
  apiKey: '',
  model: DOUBAO_DEFAULT_MODEL,
  customModels: [],
  hiddenModelIds: [],
  updatedAt: 0,
}

export function normalizeDoubaoModel(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) return DOUBAO_DEFAULT_MODEL
  return trimmed
}

function isBuiltInModel(id: string): boolean {
  return DOUBAO_BUILTIN_MODELS.some((item) => item.id === id)
}

function normalizeHiddenModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = normalizeDoubaoModel(item)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export function getAllDoubaoModels(
  customModels: DoubaoModelOption[] = [],
  hiddenModelIds: string[] = [],
): DoubaoModelOption[] {
  const hidden = new Set(hiddenModelIds.map((id) => normalizeDoubaoModel(id)))
  const builtinIds = new Set(DOUBAO_BUILTIN_MODELS.map((item) => item.id))
  const extras = customModels.filter((item) => !builtinIds.has(item.id))
  return [...DOUBAO_BUILTIN_MODELS, ...extras].filter((item) => !hidden.has(item.id))
}

export function getDoubaoModelOption(
  modelId: string,
  customModels: DoubaoModelOption[] = [],
  hiddenModelIds: string[] = [],
): DoubaoModelOption | undefined {
  const normalized = normalizeDoubaoModel(modelId)
  return getAllDoubaoModels(customModels, hiddenModelIds).find((item) => item.id === normalized)
    ?? DOUBAO_BUILTIN_MODELS.find((item) => item.id === normalized)
    ?? customModels.find((item) => item.id === normalized)
}

export function isCustomDoubaoModel(modelId: string, customModels: DoubaoModelOption[]): boolean {
  const normalized = normalizeDoubaoModel(modelId)
  return customModels.some((item) => item.id === normalized)
}

export function isBuiltInDoubaoModel(modelId: string): boolean {
  return isBuiltInModel(normalizeDoubaoModel(modelId))
}

export function estimateDoubaoSelectionTooLong(
  text: string,
  modelId: string,
  customModels: DoubaoModelOption[] = [],
  hiddenModelIds: string[] = [],
): string | null {
  const option = getDoubaoModelOption(modelId, customModels, hiddenModelIds)
  if (!option) return null
  const words = countEnglishWords(text)
  if (words <= option.suggestMaxWords) return null
  return `当前选段约 ${words} 词，建议不超过 ${option.suggestMaxWords} 词`
}

async function readSettings(): Promise<DoubaoSettings> {
  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(STORAGE_KEY)
    }
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<DoubaoSettings>
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '',
      model: normalizeDoubaoModel(typeof parsed.model === 'string' ? parsed.model : ''),
      customModels: normalizeCustomModels(parsed.customModels),
      hiddenModelIds: normalizeHiddenModelIds(parsed.hiddenModelIds),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function writeSettings(settings: DoubaoSettings): Promise<void> {
  const payload = JSON.stringify(settings)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
    return
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

function normalizeCustomModels(value: unknown): DoubaoModelOption[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: DoubaoModelOption[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Partial<DoubaoModelOption>
    const id = typeof raw.id === 'string' ? normalizeDoubaoModel(raw.id) : ''
    if (!id || seen.has(id) || isBuiltInModel(id)) continue
    seen.add(id)
    result.push({
      id,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : id,
      hint: '自定义模型/接入点',
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

export async function loadDoubaoSettings(): Promise<DoubaoSettings> {
  return readSettings()
}

export async function saveDoubaoSettings(partial: Partial<DoubaoSettings>): Promise<DoubaoSettings> {
  const current = await readSettings()
  const next: DoubaoSettings = {
    apiKey: partial.apiKey !== undefined ? partial.apiKey.trim() : current.apiKey,
    model: partial.model !== undefined ? normalizeDoubaoModel(partial.model) : current.model,
    customModels:
      partial.customModels !== undefined ? normalizeCustomModels(partial.customModels) : current.customModels,
    hiddenModelIds:
      partial.hiddenModelIds !== undefined
        ? normalizeHiddenModelIds(partial.hiddenModelIds)
        : current.hiddenModelIds,
    updatedAt: Date.now(),
  }
  await writeSettings(next)
  return next
}

export async function addCustomDoubaoModel(modelId: string, label?: string): Promise<DoubaoSettings> {
  const id = normalizeDoubaoModel(modelId)
  if (!id) throw new Error('请填写模型 ID')
  if (isBuiltInModel(id)) throw new Error('该模型已在内置列表中')
  const current = await readSettings()
  if (current.customModels.some((item) => item.id === id)) {
    throw new Error('该自定义模型已存在')
  }
  const nextModel: DoubaoModelOption = {
    id,
    label: label?.trim() || id,
    hint: '自定义模型/接入点',
    ...DEFAULT_CUSTOM_MODEL_SPECS,
  }
  return saveDoubaoSettings({
    customModels: [...current.customModels, nextModel],
    model: id,
  })
}

export async function removeCustomDoubaoModel(modelId: string): Promise<DoubaoSettings> {
  const id = normalizeDoubaoModel(modelId)
  const current = await readSettings()
  const customModels = current.customModels.filter((item) => item.id !== id)
  const hiddenModelIds = current.hiddenModelIds.filter((item) => item !== id)
  const visible = getAllDoubaoModels(customModels, hiddenModelIds)
  const model = current.model === id ? visible[0]?.id ?? DOUBAO_DEFAULT_MODEL : current.model
  return saveDoubaoSettings({ customModels, hiddenModelIds, model })
}

export async function hideDoubaoModel(modelId: string): Promise<DoubaoSettings> {
  const id = normalizeDoubaoModel(modelId)
  const current = await readSettings()
  if (current.hiddenModelIds.includes(id)) return current
  const hiddenModelIds = [...current.hiddenModelIds, id]
  const visible = getAllDoubaoModels(current.customModels, hiddenModelIds)
  const model = current.model === id ? visible[0]?.id ?? DOUBAO_DEFAULT_MODEL : current.model
  return saveDoubaoSettings({ hiddenModelIds, model })
}

export async function unhideDoubaoModel(modelId: string): Promise<DoubaoSettings> {
  const id = normalizeDoubaoModel(modelId)
  const current = await readSettings()
  const hiddenModelIds = current.hiddenModelIds.filter((item) => item !== id)
  return saveDoubaoSettings({ hiddenModelIds })
}

export async function hasDoubaoApiKey(): Promise<boolean> {
  const settings = await readSettings()
  return Boolean(settings.apiKey)
}

export { maskApiKey }

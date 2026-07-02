import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export const ENGLISH_LEVEL_OPTIONS = [
  { id: '中考', label: '中考' },
  { id: '高考', label: '高考' },
  { id: 'CET4', label: '英语四级' },
  { id: 'CET6', label: '英语六级' },
  { id: '考研', label: '考研' },
  { id: '雅思', label: '雅思' },
  { id: '托福', label: '托福' },
] as const

export type EnglishLevelId = (typeof ENGLISH_LEVEL_OPTIONS)[number]['id']

export interface UserSettings {
  englishLevel: EnglishLevelId
  showInlineTranslation: boolean
  /** 行间最多显示多少个词性 */
  maxInlinePosCount: number
  /** 每个词性下最多显示多少个释义 */
  maxMeaningsPerPos: number
  /** 行间翻译字号（px），与正文字号独立 */
  inlineGlossFontSize: number
  inlineGlossColor: string
  /** 行间翻译水平偏移（px），正值向右 */
  inlineGlossOffsetX: number
  /** 行间翻译垂直偏移（px），正值向上 */
  inlineGlossOffsetY: number
}

type LegacyUserSettings = Partial<UserSettings> & {
  maxInlineMeanings?: number
}

const STORAGE_KEY = 'read-user-settings'

const DEFAULT_SETTINGS: UserSettings = {
  englishLevel: 'CET4',
  showInlineTranslation: true,
  maxInlinePosCount: 4,
  maxMeaningsPerPos: 4,
  inlineGlossFontSize: 11,
  inlineGlossColor: '#6b7280',
  inlineGlossOffsetX: 0,
  inlineGlossOffsetY: 0,
}

function clampCount(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(10, Math.max(1, Math.round(value)))
}

function clampOffset(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(20, Math.max(-20, Math.round(value)))
}

function migrateLegacySettings(partial: LegacyUserSettings): Partial<UserSettings> {
  const next: Partial<UserSettings> = { ...partial }

  if (partial.maxInlineMeanings != null) {
    if (next.maxInlinePosCount == null) {
      next.maxInlinePosCount = partial.maxInlineMeanings
    }
    if (next.maxMeaningsPerPos == null) {
      next.maxMeaningsPerPos = DEFAULT_SETTINGS.maxMeaningsPerPos
    }
  }

  return next
}

function normalizeUserSettings(partial: LegacyUserSettings): UserSettings {
  const migrated = migrateLegacySettings(partial)
  const merged = { ...DEFAULT_SETTINGS, ...migrated }

  return {
    ...merged,
    maxInlinePosCount: clampCount(merged.maxInlinePosCount, DEFAULT_SETTINGS.maxInlinePosCount),
    maxMeaningsPerPos: clampCount(merged.maxMeaningsPerPos, DEFAULT_SETTINGS.maxMeaningsPerPos),
    inlineGlossFontSize: Math.min(16, Math.max(8, Math.round(merged.inlineGlossFontSize))),
    inlineGlossColor: merged.inlineGlossColor?.trim() || DEFAULT_SETTINGS.inlineGlossColor,
    inlineGlossOffsetX: clampOffset(merged.inlineGlossOffsetX, DEFAULT_SETTINGS.inlineGlossOffsetX),
    inlineGlossOffsetY: clampOffset(merged.inlineGlossOffsetY, DEFAULT_SETTINGS.inlineGlossOffsetY),
  }
}

export async function loadUserSettings(): Promise<UserSettings> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      if (!value) return { ...DEFAULT_SETTINGS }
      const parsed = JSON.parse(value) as LegacyUserSettings
      return normalizeUserSettings(parsed)
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return normalizeUserSettings(JSON.parse(raw) as LegacyUserSettings)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  const payload = JSON.stringify(normalizeUserSettings(settings))
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
    return
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

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
  maxInlineMeanings: number
  /** 行间翻译字号（px），与正文字号独立 */
  inlineGlossFontSize: number
}

const STORAGE_KEY = 'read-user-settings'

const DEFAULT_SETTINGS: UserSettings = {
  englishLevel: 'CET4',
  showInlineTranslation: true,
  maxInlineMeanings: 4,
  inlineGlossFontSize: 11,
}

export async function loadUserSettings(): Promise<UserSettings> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      if (!value) return { ...DEFAULT_SETTINGS }
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(value) as Partial<UserSettings>) }
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<UserSettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  const payload = JSON.stringify(settings)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
    return
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

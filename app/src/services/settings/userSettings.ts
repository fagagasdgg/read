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

/** 行间翻译预设色：黑/蓝/红 + 低对比度阅读友好色 */
export const INLINE_GLOSS_COLORS = [
  { id: 'ink', label: '墨黑', color: '#3d3d3d' },
  { id: 'blue', label: '靛蓝', color: '#5a7394' },
  { id: 'red', label: '暗红', color: '#a85858' },
  { id: 'warm-gray', label: '灰褐', color: '#7a7168' },
  { id: 'sage', label: '松绿', color: '#6d7a62' },
  { id: 'slate', label: '青灰', color: '#627480' },
  { id: 'plum', label: '紫灰', color: '#7a6f82' },
  { id: 'sepia', label: '赭石', color: '#8f7355' },
] as const

export type InlineGlossColorId = (typeof INLINE_GLOSS_COLORS)[number]['id']

export const DEFAULT_INLINE_GLOSS_COLOR = INLINE_GLOSS_COLORS[3].color

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
  /** 选段工具栏弹出延迟（毫秒） */
  selectionToolbarDelayMs: number
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
  inlineGlossColor: DEFAULT_INLINE_GLOSS_COLOR,
  inlineGlossOffsetX: 0,
  inlineGlossOffsetY: 0,
  selectionToolbarDelayMs: 850,
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

function normalizeGlossColor(color: string): string {
  const trimmed = color.trim().toLowerCase()
  const preset = INLINE_GLOSS_COLORS.find((item) => item.color === trimmed)
  if (preset) return preset.color

  // 旧版默认灰 → 灰褐
  if (trimmed === '#6b7280') return DEFAULT_INLINE_GLOSS_COLOR

  let best: string = DEFAULT_INLINE_GLOSS_COLOR
  let bestDistance = Number.POSITIVE_INFINITY
  const parse = (hex: string) => {
    const value = hex.replace('#', '')
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    }
  }

  try {
    const source = parse(trimmed)
    for (const item of INLINE_GLOSS_COLORS) {
      const target = parse(item.color)
      const distance =
        (source.r - target.r) ** 2 + (source.g - target.g) ** 2 + (source.b - target.b) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        best = item.color
      }
    }
  } catch {
    return DEFAULT_INLINE_GLOSS_COLOR
  }

  return best
}

function clampSelectionDelay(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(3000, Math.max(200, Math.round(value)))
}

function normalizeUserSettings(partial: LegacyUserSettings): UserSettings {
  const migrated = migrateLegacySettings(partial)
  const merged = { ...DEFAULT_SETTINGS, ...migrated }

  return {
    ...merged,
    maxInlinePosCount: clampCount(merged.maxInlinePosCount, DEFAULT_SETTINGS.maxInlinePosCount),
    maxMeaningsPerPos: clampCount(merged.maxMeaningsPerPos, DEFAULT_SETTINGS.maxMeaningsPerPos),
    inlineGlossFontSize: Math.min(16, Math.max(8, Math.round(merged.inlineGlossFontSize))),
    inlineGlossColor: normalizeGlossColor(merged.inlineGlossColor || DEFAULT_INLINE_GLOSS_COLOR),
    inlineGlossOffsetX: clampOffset(merged.inlineGlossOffsetX, DEFAULT_SETTINGS.inlineGlossOffsetX),
    inlineGlossOffsetY: clampOffset(merged.inlineGlossOffsetY, DEFAULT_SETTINGS.inlineGlossOffsetY),
    selectionToolbarDelayMs: clampSelectionDelay(
      merged.selectionToolbarDelayMs,
      DEFAULT_SETTINGS.selectionToolbarDelayMs,
    ),
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

export const INLINE_GLOSS_DEFAULTS = {
  maxInlinePosCount: DEFAULT_SETTINGS.maxInlinePosCount,
  maxMeaningsPerPos: DEFAULT_SETTINGS.maxMeaningsPerPos,
  inlineGlossFontSize: DEFAULT_SETTINGS.inlineGlossFontSize,
  inlineGlossColor: DEFAULT_INLINE_GLOSS_COLOR,
  inlineGlossOffsetX: DEFAULT_SETTINGS.inlineGlossOffsetX,
  inlineGlossOffsetY: DEFAULT_SETTINGS.inlineGlossOffsetY,
} as const

export function buildInlineGlossResetPatch(): Pick<
  UserSettings,
  | 'maxInlinePosCount'
  | 'maxMeaningsPerPos'
  | 'inlineGlossFontSize'
  | 'inlineGlossColor'
  | 'inlineGlossOffsetX'
  | 'inlineGlossOffsetY'
> {
  return { ...INLINE_GLOSS_DEFAULTS }
}

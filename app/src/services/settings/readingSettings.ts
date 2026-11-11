import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export interface ReadingTheme {
  id: string
  label: string
  background: string
  text: string
  bar: string
}

export interface ReadingFont {
  id: string
  label: string
  stack: string
}

export const READING_FONTS: ReadingFont[] = [
  {
    id: 'system',
    label: '系统默认',
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: 'serif',
    label: '书籍衬线',
    stack: 'Georgia, "Noto Serif", "Times New Roman", serif',
  },
  {
    id: 'classic',
    label: '经典印刷',
    stack: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
  },
  {
    id: 'sans',
    label: '清晰无衬线',
    stack: 'Roboto, "Helvetica Neue", Arial, sans-serif',
  },
]

export interface NoteUnderlineColor {
  id: string
  label: string
  color: string
}

/** 参考掌阅划线风格的下划线色 */
export const NOTE_UNDERLINE_COLORS: NoteUnderlineColor[] = [
  { id: 'orange', label: '暖橙', color: '#e8913a' },
  { id: 'blue', label: '雾蓝', color: '#5b8def' },
  { id: 'green', label: '芽绿', color: '#5aaa6a' },
  { id: 'purple', label: '暮紫', color: '#9b7bb8' },
  { id: 'gray', label: '石墨', color: '#8a8580' },
]

export const DEFAULT_NOTE_UNDERLINE_COLOR = NOTE_UNDERLINE_COLORS[0].color

export interface ReadingSettings {
  fontSize: number
  lineHeight: number
  themeId: string
  fontFamilyId: string
  /** 在正文用下划线显示本书绑定笔记本中的笔记 */
  showInBookNotes: boolean
  noteUnderlineColor: string
}

export const READING_THEMES: ReadingTheme[] = [
  { id: 'parchment', label: '羊皮纸', background: '#f3e9d2', text: '#1f2937', bar: '#e5d5b7' },
  { id: 'green', label: '护眼绿', background: '#e8f5e9', text: '#1b4332', bar: '#c8e6c9' },
  { id: 'white', label: '纯白', background: '#ffffff', text: '#111827', bar: '#e5e7eb' },
  { id: 'night', label: '夜间', background: '#1a1a1a', text: '#d1d5db', bar: '#374151' },
]

const STORAGE_KEY = 'read-reading-settings'

const DEFAULT_SETTINGS: ReadingSettings = {
  fontSize: 17,
  lineHeight: 1.75,
  themeId: 'parchment',
  fontFamilyId: 'serif',
  showInBookNotes: true,
  noteUnderlineColor: DEFAULT_NOTE_UNDERLINE_COLOR,
}

function normalizeNoteUnderlineColor(color: string | undefined): string {
  const trimmed = (color ?? '').trim().toLowerCase()
  if (!trimmed) return DEFAULT_NOTE_UNDERLINE_COLOR
  const preset = NOTE_UNDERLINE_COLORS.find((item) => item.color === trimmed)
  return preset?.color ?? DEFAULT_NOTE_UNDERLINE_COLOR
}

function normalizeReadingSettings(partial: Partial<ReadingSettings>): ReadingSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    showInBookNotes:
      partial.showInBookNotes == null ? DEFAULT_SETTINGS.showInBookNotes : Boolean(partial.showInBookNotes),
    noteUnderlineColor: normalizeNoteUnderlineColor(partial.noteUnderlineColor),
  }
}

export function getFontById(fontFamilyId: string): ReadingFont {
  return READING_FONTS.find((f) => f.id === fontFamilyId) ?? READING_FONTS[0]
}

export function getThemeById(themeId: string): ReadingTheme {
  return READING_THEMES.find((t) => t.id === themeId) ?? READING_THEMES[0]
}

export async function loadReadingSettings(): Promise<ReadingSettings> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      if (!value) return { ...DEFAULT_SETTINGS }
      return normalizeReadingSettings(JSON.parse(value) as Partial<ReadingSettings>)
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return normalizeReadingSettings(JSON.parse(raw) as Partial<ReadingSettings>)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveReadingSettings(settings: ReadingSettings): Promise<void> {
  const payload = JSON.stringify(normalizeReadingSettings(settings))
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
    return
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

export const APP_SHELL_THEMES = [
  {
    id: 'wood',
    label: '木质掌阅',
    description: '温暖木纹书架，经典掌阅风',
  },
  {
    id: 'paper',
    label: '素纸张',
    description: '干净米白底，清爽简约',
  },
  {
    id: 'ink',
    label: '墨韵',
    description: '深色沉稳，夜间护眼',
  },
  {
    id: 'forest',
    label: '护眼绿',
    description: '柔和绿色，长时间阅读不累',
  },
  {
    id: 'ocean',
    label: '深海蓝',
    description: '冷静蓝灰，专注沉静',
  },
] as const

export type AppShellThemeId = (typeof APP_SHELL_THEMES)[number]['id']

export const DEFAULT_APP_SHELL_THEME: AppShellThemeId = 'wood'

export function isAppShellThemeId(value: string): value is AppShellThemeId {
  return APP_SHELL_THEMES.some((theme) => theme.id === value)
}

export function normalizeAppShellThemeId(value: string | undefined): AppShellThemeId {
  if (value && isAppShellThemeId(value)) return value
  return DEFAULT_APP_SHELL_THEME
}

import { APP_SHELL_THEMES, type AppShellThemeId } from '../../services/settings/appShellTheme'

interface AppShellThemePickerProps {
  value: AppShellThemeId
  onChange: (themeId: AppShellThemeId) => void
}

export function AppShellThemePicker({ value, onChange }: AppShellThemePickerProps) {
  return (
    <div className="app-theme-grid" role="radiogroup" aria-label="应用界面风格">
      {APP_SHELL_THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          role="radio"
          aria-checked={value === theme.id}
          className={`app-theme-chip${value === theme.id ? ' active' : ''}`}
          data-theme-preview={theme.id}
          onClick={() => onChange(theme.id)}
        >
          <span className="app-theme-chip-preview" aria-hidden />
          <span className="app-theme-chip-text">
            <strong>{theme.label}</strong>
            <small>{theme.description}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

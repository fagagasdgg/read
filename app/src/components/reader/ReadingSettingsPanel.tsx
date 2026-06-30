import {
  READING_THEMES,
  type ReadingSettings,
  saveReadingSettings,
} from '../../services/settings/readingSettings'

interface ReadingSettingsPanelProps {
  settings: ReadingSettings
  onChange: (settings: ReadingSettings) => void
  onClose: () => void
}

export function ReadingSettingsPanel({ settings, onChange, onClose }: ReadingSettingsPanelProps) {
  function update(partial: Partial<ReadingSettings>) {
    const next = { ...settings, ...partial }
    onChange(next)
    void saveReadingSettings(next)
  }

  return (
    <div className="reader-overlay" onClick={onClose}>
      <div className="reader-settings-panel" onClick={(e) => e.stopPropagation()}>
        <h3>阅读设置</h3>

        <label className="reader-setting-row">
          <span>字号 {settings.fontSize}px</span>
          <input
            type="range"
            min={14}
            max={26}
            step={1}
            value={settings.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
          />
        </label>

        <label className="reader-setting-row">
          <span>行间距 {(settings.lineHeight * 100).toFixed(0)}%</span>
          <input
            type="range"
            min={1.4}
            max={2.2}
            step={0.05}
            value={settings.lineHeight}
            onChange={(e) => update({ lineHeight: Number(e.target.value) })}
          />
        </label>

        <div className="reader-setting-row">
          <span>背景</span>
          <div className="reader-theme-grid">
            {READING_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`reader-theme-chip${settings.themeId === theme.id ? ' active' : ''}`}
                style={{ background: theme.background, color: theme.text }}
                onClick={() => update({ themeId: theme.id })}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>

        <p className="reader-settings-note">更多设置（英语水平、行间翻译等）将在主设置中开放</p>
      </div>
    </div>
  )
}

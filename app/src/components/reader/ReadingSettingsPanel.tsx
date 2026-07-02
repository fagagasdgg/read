import { useEffect, useState } from 'react'
import { DICTIONARY_SOURCES, getDictionaryCacheStats } from '../../services/dictionary'
import {
  ENGLISH_LEVEL_OPTIONS,
  type UserSettings,
  saveUserSettings,
} from '../../services/settings/userSettings'
import {
  READING_FONTS,
  READING_THEMES,
  type ReadingSettings,
  saveReadingSettings,
} from '../../services/settings/readingSettings'

interface ReadingSettingsPanelProps {
  settings: ReadingSettings
  userSettings: UserSettings
  onChange: (settings: ReadingSettings) => void
  onUserChange: (settings: UserSettings) => void
  onClose: () => void
}

export function ReadingSettingsPanel({
  settings,
  userSettings,
  onChange,
  onUserChange,
  onClose,
}: ReadingSettingsPanelProps) {
  const [cacheStats, setCacheStats] = useState({ wordCount: 0, notFoundCount: 0 })

  useEffect(() => {
    void getDictionaryCacheStats().then(setCacheStats)
  }, [])

  function updateReading(partial: Partial<ReadingSettings>) {
    const next = { ...settings, ...partial }
    onChange(next)
    void saveReadingSettings(next)
  }

  function updateUser(partial: Partial<UserSettings>) {
    const next = { ...userSettings, ...partial }
    onUserChange(next)
    void saveUserSettings(next)
  }

  return (
    <div className="reader-overlay" onClick={onClose}>
      <div className="reader-settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="reader-settings-header">
          <h3>阅读设置</h3>
          <button type="button" className="reader-settings-close" onClick={onClose} aria-label="关闭设置">
            ×
          </button>
        </header>

        <div className="reader-settings-body">
          <label className="reader-setting-row">
            <span>字号 {settings.fontSize}px</span>
            <input
              type="range"
              min={14}
              max={26}
              step={1}
              value={settings.fontSize}
              onChange={(e) => updateReading({ fontSize: Number(e.target.value) })}
            />
          </label>

          <label className="reader-setting-row">
            <span>行间距 {(settings.lineHeight * 100).toFixed(0)}%</span>
            <input
              type="range"
              min={1.4}
              max={3}
              step={0.05}
              value={settings.lineHeight}
              onChange={(e) => updateReading({ lineHeight: Number(e.target.value) })}
            />
          </label>

          <div className="reader-setting-row">
            <span>英文字体</span>
            <div className="reader-theme-grid">
              {READING_FONTS.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  className={`reader-theme-chip reader-font-chip${settings.fontFamilyId === font.id ? ' active' : ''}`}
                  style={{ fontFamily: font.stack }}
                  onClick={() => updateReading({ fontFamilyId: font.id })}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>

          <div className="reader-setting-row">
            <span>背景</span>
            <div className="reader-theme-grid">
              {READING_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`reader-theme-chip${settings.themeId === theme.id ? ' active' : ''}`}
                  style={{ background: theme.background, color: theme.text }}
                  onClick={() => updateReading({ themeId: theme.id })}
                >
                  {theme.label}
                </button>
              ))}
            </div>
          </div>

          <div className="reader-settings-divider" />

          <h4 className="reader-settings-subtitle">行间翻译</h4>

          <label className="reader-setting-toggle">
            <span>显示行间翻译</span>
            <input
              type="checkbox"
              checked={userSettings.showInlineTranslation}
              onChange={(e) => updateUser({ showInlineTranslation: e.target.checked })}
            />
          </label>

          <label className="reader-setting-row">
            <span>你的英语水平</span>
            <select
              className="reader-level-select"
              value={userSettings.englishLevel}
              onChange={(e) =>
                updateUser({ englishLevel: e.target.value as UserSettings['englishLevel'] })
              }
            >
              {ENGLISH_LEVEL_OPTIONS.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>

          <p className="reader-settings-note">
            仅对高于你所选水平的单词显示行间释义。偏移、颜色等高级选项将在主设置中开放。
          </p>

          <div className="reader-settings-divider" />

          <h4 className="reader-settings-subtitle">查词信源</h4>
          <ul className="reader-dict-sources">
            {DICTIONARY_SOURCES.map((source) => (
              <li key={source.id} className="reader-dict-source-item">
                <span className="reader-dict-source-name">
                  {source.label}
                  <em className={`reader-dict-source-role reader-dict-source-role-${source.role}`}>
                    {source.role === 'primary' ? '主' : '备'}
                  </em>
                </span>
                <span className="reader-dict-source-desc">{source.description}</span>
              </li>
            ))}
          </ul>
          <p className="reader-settings-note">有道未命中时自动尝试金山词霸，结果会缓存到本地。</p>

          <div className="reader-settings-divider" />

          <h4 className="reader-settings-subtitle">词典缓存（调试）</h4>
          <p className="reader-cache-stats">
            已缓存词条：<strong>{cacheStats.wordCount}</strong>
            <br />
            查不到已标记：<strong>{cacheStats.notFoundCount}</strong>
          </p>
        </div>
      </div>
    </div>
  )
}

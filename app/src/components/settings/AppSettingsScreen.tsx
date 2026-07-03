import { useEffect, useState } from 'react'
import {
  ENGLISH_LEVEL_OPTIONS,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from '../../services/settings/userSettings'
import { BackupDirectorySection } from './BackupDirectorySection'
import { DeepAnalysisSettings } from './DeepAnalysisSettings'
import { DictionarySourcesSection } from './DictionarySourcesSection'

export function AppSettingsScreen() {
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)

  useEffect(() => {
    void loadUserSettings().then(setUserSettings)
  }, [])

  function updateUser(partial: Partial<UserSettings>) {
    if (!userSettings) return
    const next = { ...userSettings, ...partial }
    setUserSettings(next)
    void saveUserSettings(next)
  }

  return (
    <div className="app-settings-screen">
      <header className="app-settings-header">
        <h1>设置</h1>
      </header>

      <div className="app-settings-body">
        <section className="settings-section">
          <h4 className="settings-section-title">学习偏好</h4>
          <label className="reader-setting-row">
            <span>你的英语水平</span>
            <select
              className="reader-level-select"
              value={userSettings?.englishLevel ?? 'CET4'}
              disabled={!userSettings}
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
          <p className="settings-section-note">
            影响行间翻译显示阈值：仅对高于你所选水平的单词显示行间释义。
          </p>
        </section>

        <div className="settings-section-divider" />

        <DeepAnalysisSettings />

        <div className="settings-section-divider" />

        <BackupDirectorySection />

        <div className="settings-section-divider" />

        <DictionarySourcesSection />
      </div>
    </div>
  )
}

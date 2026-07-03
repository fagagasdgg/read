import { useEffect, useState } from 'react'
import { getDictionaryCacheStats } from '../../services/dictionary'
import { getMasteredWordCount, subscribeMasteredWords } from '../../services/words/mastered'
import { getLemmaPhraseWordCount } from '../../services/words/phrases'
import {
  ENGLISH_LEVEL_OPTIONS,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from '../../services/settings/userSettings'
import { BackupDirectorySection } from './BackupDirectorySection'
import { DictionarySourcesSection } from './DictionarySourcesSection'
import { ZhipuApiSection } from './ZhipuApiSection'

export function AppSettingsScreen() {
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [cacheStats, setCacheStats] = useState({ wordCount: 0, notFoundCount: 0 })
  const [masteredCount, setMasteredCount] = useState(0)
  const [phraseWordCount, setPhraseWordCount] = useState(0)

  useEffect(() => {
    void loadUserSettings().then(setUserSettings)
  }, [])

  useEffect(() => {
    async function refreshStats() {
      const [cache, mastered, phraseWords] = await Promise.all([
        getDictionaryCacheStats(),
        getMasteredWordCount(),
        getLemmaPhraseWordCount(),
      ])
      setCacheStats(cache)
      setMasteredCount(mastered)
      setPhraseWordCount(phraseWords)
    }
    void refreshStats()
    const unsub = subscribeMasteredWords(() => {
      void getMasteredWordCount().then(setMasteredCount)
    })
    return unsub
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

        <ZhipuApiSection />

        <div className="settings-section-divider" />

        <BackupDirectorySection />

        <div className="settings-section-divider" />

        <DictionarySourcesSection />

        <div className="settings-section-divider" />

        <section className="settings-section">
          <h4 className="settings-section-title">词典缓存（调试）</h4>
          <p className="reader-cache-stats">
            已缓存词条：<strong>{cacheStats.wordCount}</strong>
            <br />
            查不到已标记：<strong>{cacheStats.notFoundCount}</strong>
            <br />
            已掌握单词：<strong>{masteredCount}</strong>
            <br />
            已添加词组的单词：<strong>{phraseWordCount}</strong>
          </p>
        </section>
      </div>
    </div>
  )
}

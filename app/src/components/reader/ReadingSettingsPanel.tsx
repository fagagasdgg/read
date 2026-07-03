import { useCallback, useEffect, useState } from 'react'
import { getDictionaryCacheStats } from '../../services/dictionary'
import {
  getBookDefaultNotebookId,
  setBookDefaultNotebookId,
} from '../../services/notes/bookNotebook'
import { listNotebooks, type NotebookMeta } from '../../services/notes/notebooks'
import { getMasteredWordCount, subscribeMasteredWords } from '../../services/words/mastered'
import { getLemmaPhraseWordCount } from '../../services/words/phrases'
import { SettingStepper } from './SettingStepper'
import {
  INLINE_GLOSS_COLORS,
  buildInlineGlossResetPatch,
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
  bookId: string
  settings: ReadingSettings
  userSettings: UserSettings
  onChange: (settings: ReadingSettings) => void
  onUserChange: (settings: UserSettings) => void
  onClose: () => void
}

export function ReadingSettingsPanel({
  bookId,
  settings,
  userSettings,
  onChange,
  onUserChange,
  onClose,
}: ReadingSettingsPanelProps) {
  const [cacheStats, setCacheStats] = useState({ wordCount: 0, notFoundCount: 0 })
  const [masteredCount, setMasteredCount] = useState(0)
  const [phraseWordCount, setPhraseWordCount] = useState(0)
  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([])
  const [defaultNotebookId, setDefaultNotebookId] = useState<string>('')

  const refreshStats = useCallback(async () => {
    const [cache, mastered, phraseWords, nbList, bookNb] = await Promise.all([
      getDictionaryCacheStats(),
      getMasteredWordCount(),
      getLemmaPhraseWordCount(),
      listNotebooks(),
      getBookDefaultNotebookId(bookId),
    ])
    setCacheStats(cache)
    setMasteredCount(mastered)
    setPhraseWordCount(phraseWords)
    setNotebooks(nbList)
    setDefaultNotebookId(bookNb ?? '')
  }, [bookId])

  useEffect(() => {
    void refreshStats()
    const unsubMastered = subscribeMasteredWords(() => {
      void getMasteredWordCount().then(setMasteredCount)
    })
    return unsubMastered
  }, [refreshStats])

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

  async function handleDefaultNotebookChange(notebookId: string) {
    const nextId = notebookId || null
    setDefaultNotebookId(notebookId)
    await setBookDefaultNotebookId(bookId, nextId)
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
          <h4 className="reader-settings-subtitle">排版</h4>

          <SettingStepper
            label="字号"
            value={settings.fontSize}
            min={14}
            max={26}
            step={1}
            formatValue={(v) => `${v}px`}
            onChange={(fontSize) => updateReading({ fontSize })}
          />

          <SettingStepper
            label="行间距"
            value={settings.lineHeight}
            min={1.4}
            max={3}
            step={0.05}
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(lineHeight) => updateReading({ lineHeight })}
          />

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

          <p className="reader-settings-note">
            英语水平请在应用「设置」页调整，影响行间释义显示阈值。
          </p>

          <SettingStepper
            label="最多显示词性翻译"
            value={userSettings.maxInlinePosCount}
            min={1}
            max={10}
            formatValue={(v) => `${v} 个`}
            onChange={(maxInlinePosCount) => updateUser({ maxInlinePosCount })}
          />

          <SettingStepper
            label="每个词性最多显示释义"
            value={userSettings.maxMeaningsPerPos}
            min={1}
            max={10}
            formatValue={(v) => `${v} 个`}
            onChange={(maxMeaningsPerPos) => updateUser({ maxMeaningsPerPos })}
          />

          <p className="reader-settings-note">
            例如设为 2 + 2：显示 n. 前两个释义、adj. 前两个释义。
          </p>

          <SettingStepper
            label="行间翻译字号"
            value={userSettings.inlineGlossFontSize}
            min={8}
            max={16}
            formatValue={(v) => `${v}px`}
            onChange={(inlineGlossFontSize) => updateUser({ inlineGlossFontSize })}
          />

          <div className="reader-setting-row">
            <span>行间翻译颜色</span>
            <div className="reader-gloss-color-grid">
              {INLINE_GLOSS_COLORS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`reader-gloss-color-chip${userSettings.inlineGlossColor === item.color ? ' active' : ''}`}
                  style={{ color: item.color }}
                  onClick={() => updateUser({ inlineGlossColor: item.color })}
                  aria-label={item.label}
                  title={item.label}
                >
                  <span className="reader-gloss-color-dot" style={{ background: item.color }} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <SettingStepper
            label="水平偏移"
            value={userSettings.inlineGlossOffsetX}
            min={-20}
            max={20}
            formatValue={(v) => `${v}px`}
            onChange={(inlineGlossOffsetX) => updateUser({ inlineGlossOffsetX })}
          />

          <SettingStepper
            label="垂直偏移"
            value={userSettings.inlineGlossOffsetY}
            min={-20}
            max={20}
            formatValue={(v) => `${v}px`}
            onChange={(inlineGlossOffsetY) => updateUser({ inlineGlossOffsetY })}
          />

          <button
            type="button"
            className="reader-gloss-reset-btn"
            onClick={() => updateUser(buildInlineGlossResetPatch())}
          >
            恢复行间翻译默认
          </button>

          <div className="reader-settings-divider" />

          <h4 className="reader-settings-subtitle">本书笔记</h4>
          <label className="reader-setting-row">
            <span>默认保存笔记本</span>
            <select
              className="reader-level-select"
              value={defaultNotebookId}
              onChange={(e) => void handleDefaultNotebookChange(e.target.value)}
            >
              <option value="">每次保存时选择</option>
              {notebooks.map((nb) => (
                <option key={nb.id} value={nb.id}>
                  {nb.title}
                </option>
              ))}
            </select>
          </label>
          <p className="reader-settings-note">
            深度解析后存笔记时，将优先保存到此笔记本；未设置则每次弹出选择。
          </p>

          <div className="reader-settings-divider" />

          <h4 className="reader-settings-subtitle">词典缓存（调试）</h4>
          <p className="reader-cache-stats">
            已缓存词条：<strong>{cacheStats.wordCount}</strong>
            <br />
            查不到已标记：<strong>{cacheStats.notFoundCount}</strong>
            <br />
            已掌握单词：<strong>{masteredCount}</strong>
            <br />
            已添加词组的单词：<strong>{phraseWordCount}</strong>
          </p>
          <p className="reader-settings-note">
            查词信源、数据备份等应用级设置请前往首页「设置」页。
          </p>
        </div>
      </div>
    </div>
  )
}

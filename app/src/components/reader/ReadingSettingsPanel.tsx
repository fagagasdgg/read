import { useCallback, useEffect, useState } from 'react'
import {
  DICTIONARY_SOURCES,
  formatSourceCheckTime,
  getDictionaryCacheStats,
  getDictionarySourceStatus,
  probeDictionarySources,
  subscribeDictionarySourceStatus,
  type SourceStatusView,
} from '../../services/dictionary'
import {
  formatBackupDirectoryLabel,
  loadBackupDirectorySettings,
  pickBackupDirectory,
  type BackupDirectorySettings,
} from '../../services/settings/backupDirectory'
import { getMasteredWordCount, subscribeMasteredWords } from '../../services/words/mastered'
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

function mergeSourceViews(staticSources: typeof DICTIONARY_SOURCES, dynamic: SourceStatusView[]) {
  const map = new Map(dynamic.map((item) => [item.id, item]))
  return staticSources.map((source) => {
    const status = map.get(source.id)
    if (status) return { ...source, status }
    return {
      ...source,
      status: {
        id: source.id,
        label: source.label,
        role: source.role,
        health: 'unknown' as const,
        healthLabel: '未检测',
        totalChecks: 0,
        hitCount: 0,
        missCount: 0,
        errorCount: 0,
        successRate: null,
        lastCheckAt: null,
        lastErrorMessage: '',
      },
    }
  })
}

export function ReadingSettingsPanel({
  settings,
  userSettings,
  onChange,
  onUserChange,
  onClose,
}: ReadingSettingsPanelProps) {
  const [cacheStats, setCacheStats] = useState({ wordCount: 0, notFoundCount: 0 })
  const [sourceViews, setSourceViews] = useState<SourceStatusView[]>([])
  const [probing, setProbing] = useState(false)
  const [masteredCount, setMasteredCount] = useState(0)
  const [backupDir, setBackupDir] = useState<BackupDirectorySettings | null>(null)
  const [pickingDir, setPickingDir] = useState(false)
  const [dirMessage, setDirMessage] = useState('')

  const refreshStats = useCallback(async () => {
    const [cache, sources, mastered, dir] = await Promise.all([
      getDictionaryCacheStats(),
      getDictionarySourceStatus(),
      getMasteredWordCount(),
      loadBackupDirectorySettings(),
    ])
    setCacheStats(cache)
    setSourceViews(sources)
    setMasteredCount(mastered)
    setBackupDir(dir)
  }, [])

  useEffect(() => {
    void refreshStats()
    const unsubSources = subscribeDictionarySourceStatus(() => {
      void getDictionarySourceStatus().then(setSourceViews)
    })
    const unsubMastered = subscribeMasteredWords(() => {
      void getMasteredWordCount().then(setMasteredCount)
    })
    return () => {
      unsubSources()
      unsubMastered()
    }
  }, [refreshStats])

  const sourcesWithStatus = mergeSourceViews(DICTIONARY_SOURCES, sourceViews)

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

  async function handleProbeSources() {
    setProbing(true)
    try {
      const next = await probeDictionarySources()
      setSourceViews(next)
    } finally {
      setProbing(false)
    }
  }

  async function handlePickBackupDirectory() {
    setPickingDir(true)
    setDirMessage('')
    try {
      const next = await pickBackupDirectory()
      if (next) {
        setBackupDir(next)
        setDirMessage('默认备份目录已更新')
      }
    } catch (err) {
      setDirMessage(err instanceof Error ? err.message : '选择目录失败')
    } finally {
      setPickingDir(false)
    }
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

          <label className="reader-setting-row">
            <span>行间最多显示 {userSettings.maxInlineMeanings} 个义项</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={userSettings.maxInlineMeanings}
              onChange={(e) => updateUser({ maxInlineMeanings: Number(e.target.value) })}
            />
          </label>

          <div className="reader-settings-divider" />

          <div className="reader-dict-sources-header">
            <h4 className="reader-settings-subtitle">查词信源</h4>
            <button
              type="button"
              className="reader-dict-probe-btn"
              onClick={() => void handleProbeSources()}
              disabled={probing}
            >
              {probing ? '检测中…' : '检测信源'}
            </button>
          </div>

          <ul className="reader-dict-sources">
            {sourcesWithStatus.map(({ id, label, role, description, status }) => (
              <li key={id} className="reader-dict-source-item">
                <div className="reader-dict-source-top">
                  <span className="reader-dict-source-name">
                    {label}
                    <em className={`reader-dict-source-role reader-dict-source-role-${role}`}>
                      {role === 'primary' ? '主' : '备'}
                    </em>
                  </span>
                  <span className={`reader-dict-health reader-dict-health-${status.health}`}>
                    {status.healthLabel}
                  </span>
                </div>
                <span className="reader-dict-source-desc">{description}</span>
                <span className="reader-dict-source-metrics">
                  {status.totalChecks > 0 ? (
                    <>
                      可用率 <strong>{status.successRate ?? 0}%</strong>
                      <span className="reader-dict-metric-sep">·</span>
                      命中 {status.hitCount}
                      <span className="reader-dict-metric-sep">·</span>
                      失败 {status.errorCount}
                    </>
                  ) : (
                    '尚无查词记录，可点「检测信源」'
                  )}
                </span>
                <span className="reader-dict-source-time">
                  最近检测：{formatSourceCheckTime(status.lastCheckAt)}
                </span>
                {status.lastErrorMessage && status.health !== 'healthy' && (
                  <span className="reader-dict-source-error">{status.lastErrorMessage}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="reader-settings-note">
            阅读时自动累计各信源状态；有道未命中时自动尝试金山词霸。
          </p>

          <div className="reader-settings-divider" />

          <h4 className="reader-settings-subtitle">数据备份目录</h4>
          <p className="reader-backup-dir-path">
            当前目录：<strong>{formatBackupDirectoryLabel(backupDir ?? { displayPath: '', nativePath: '', webDirectoryName: '', updatedAt: 0 })}</strong>
          </p>
          <button
            type="button"
            className="reader-backup-dir-btn"
            onClick={() => void handlePickBackupDirectory()}
            disabled={pickingDir}
          >
            {pickingDir ? '打开选择器…' : '选择默认保存目录'}
          </button>
          {dirMessage && <p className="reader-backup-dir-message">{dirMessage}</p>}
          <p className="reader-settings-note">
            导入/导出功能开发完成后，将在此目录读写词典、笔记、已掌握单词等数据。卸载重装后可通过导入恢复。
          </p>

          <div className="reader-settings-divider" />

          <h4 className="reader-settings-subtitle">词典缓存（调试）</h4>
          <p className="reader-cache-stats">
            已缓存词条：<strong>{cacheStats.wordCount}</strong>
            <br />
            查不到已标记：<strong>{cacheStats.notFoundCount}</strong>
            <br />
            已掌握单词：<strong>{masteredCount}</strong>
          </p>
        </div>
      </div>
    </div>
  )
}

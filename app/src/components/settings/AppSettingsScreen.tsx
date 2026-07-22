import { useEffect, useState } from 'react'
import {
  ENGLISH_LEVEL_OPTIONS,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from '../../services/settings/userSettings'
import { BackupDirectorySection } from './BackupDirectorySection'
import { CollapsibleSettingsSection } from './CollapsibleSettingsSection'
import { DeepAnalysisSettings } from './DeepAnalysisSettings'
import { DictionarySourcesSection } from './DictionarySourcesSection'

function SelectionDelayInput({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled?: boolean
  onChange: (next: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    setDraft(null)
  }, [value])

  const displayValue = draft ?? String(value)

  function commitDraft(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      setDraft(null)
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setDraft(null)
      return
    }
    const clamped = Math.min(3000, Math.max(200, Math.round(parsed)))
    onChange(clamped)
    setDraft(null)
  }

  return (
    <div className="settings-inline-stepper">
      <input
        type="number"
        min={200}
        max={3000}
        step={50}
        inputMode="numeric"
        value={displayValue}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commitDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
      <span className="settings-inline-unit">毫秒</span>
    </div>
  )
}

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
        <CollapsibleSettingsSection
          title="学习偏好"
          summary="英语水平与行间翻译阈值"
          defaultExpanded
        >
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
        </CollapsibleSettingsSection>

        <CollapsibleSettingsSection title="阅读交互" summary="选段工具栏弹出延迟">
          <label className="reader-setting-row">
            <span>选段工具弹出延迟</span>
            <SelectionDelayInput
              value={userSettings?.selectionToolbarDelayMs ?? 850}
              disabled={!userSettings}
              onChange={(selectionToolbarDelayMs) => updateUser({ selectionToolbarDelayMs })}
            />
          </label>
          <p className="settings-section-note">
            长按选段后，等待该时长再弹出工具栏，避免拖动手柄时被挡住。默认 850 毫秒。
          </p>
        </CollapsibleSettingsSection>

        <CollapsibleSettingsSection title="深度解析（AI）" summary="智谱 / 豆包 API 与模型">
          <DeepAnalysisSettings embedded />
        </CollapsibleSettingsSection>

        <CollapsibleSettingsSection title="数据备份目录" summary="导出 zip 与学习数据的默认保存位置">
          <BackupDirectorySection embedded />
        </CollapsibleSettingsSection>

        <CollapsibleSettingsSection title="词典信源" summary="有道、金山词霸可用率与健康度">
          <DictionarySourcesSection embedded />
        </CollapsibleSettingsSection>
      </div>
    </div>
  )
}

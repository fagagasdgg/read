import { useState } from 'react'
import { EXAM_LEVEL_OPTIONS, formatExamLevelLabel } from '../../lib/examLevel'
import { DoubaoPasteSheet } from '../reader/DoubaoPasteSheet'
import { copyDoubaoWordPrompt } from '../../services/llm/doubaoWordWorkflow'
import {
  parseDoubaoWordClipboard,
  saveManualWordEntry,
  type ManualWordDraft,
} from '../../services/dictionary/manualWord'

interface NotFoundWordEditorProps {
  lemma: string
  onSaved: () => void
  onCancel: () => void
}

function emptyDraft(lemma: string): ManualWordDraft {
  return {
    lemma,
    phoneticUs: '',
    phoneticUk: '',
    examLevels: [],
    definitions: [{ pos: '', translation: '' }],
    forms: [],
  }
}

export function NotFoundWordEditor({ lemma, onSaved, onCancel }: NotFoundWordEditorProps) {
  const [draft, setDraft] = useState<ManualWordDraft>(() => emptyDraft(lemma))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [copyHint, setCopyHint] = useState('')

  function toggleLevel(level: string) {
    setDraft((prev) => {
      const exists = prev.examLevels.includes(level)
      return {
        ...prev,
        examLevels: exists
          ? prev.examLevels.filter((item) => item !== level)
          : [...prev.examLevels, level],
      }
    })
  }

  async function handleCopyPrompt() {
    try {
      await copyDoubaoWordPrompt(lemma)
      setCopyHint('已复制豆包指令，请在豆包中粘贴发送')
      setTimeout(() => setCopyHint(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制失败')
    }
  }

  function handlePasteConfirm(text: string) {
    try {
      const parsed = parseDoubaoWordClipboard(text, lemma)
      setDraft(parsed)
      setPasteOpen(false)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败')
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const cleaned: ManualWordDraft = {
        ...draft,
        definitions: draft.definitions.filter((item) => item.translation.trim()),
        forms: draft.forms.filter((item) => item.label.trim() && item.value.trim()),
      }
      await saveManualWordEntry(cleaned)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="notfound-word-editor">
      <h2 className="notfound-word-editor-title">{lemma}</h2>
      <p className="notfound-word-editor-hint">
        手动填写或使用豆包快速导入。保存后将写入词典缓存，并从待补全列表移除。
      </p>

      <div className="notfound-word-doubao-row">
        <button type="button" className="notfound-word-btn" onClick={() => void handleCopyPrompt()}>
          复制豆包指令
        </button>
        <button type="button" className="notfound-word-btn" onClick={() => setPasteOpen(true)}>
          粘贴豆包回复
        </button>
      </div>
      {copyHint ? <p className="notfound-word-copy-hint">{copyHint}</p> : null}

      <label className="notfound-word-field">
        <span>美音音标</span>
        <input
          value={draft.phoneticUs}
          onChange={(e) => setDraft((prev) => ({ ...prev, phoneticUs: e.target.value }))}
          placeholder="如 lʊk"
        />
      </label>
      <label className="notfound-word-field">
        <span>英音音标</span>
        <input
          value={draft.phoneticUk}
          onChange={(e) => setDraft((prev) => ({ ...prev, phoneticUk: e.target.value }))}
          placeholder="如 lʊk"
        />
      </label>

      <div className="notfound-word-field">
        <span>考试等级</span>
        <div className="popup-level-chips notfound-level-chips">
          {EXAM_LEVEL_OPTIONS.map((level) => (
            <button
              key={level}
              type="button"
              className={`popup-level-chip${draft.examLevels.includes(level) ? ' active' : ''}`}
              onClick={() => toggleLevel(level)}
            >
              {formatExamLevelLabel(level)}
            </button>
          ))}
        </div>
      </div>

      <div className="notfound-word-field">
        <span>释义</span>
        {draft.definitions.map((def, index) => (
          <div key={`def-${index}`} className="notfound-def-row">
            <input
              className="notfound-def-pos"
              value={def.pos ?? ''}
              onChange={(e) =>
                setDraft((prev) => {
                  const next = [...prev.definitions]
                  next[index] = { ...next[index], pos: e.target.value }
                  return { ...prev, definitions: next }
                })
              }
              placeholder="词性"
            />
            <input
              className="notfound-def-tr"
              value={def.translation}
              onChange={(e) =>
                setDraft((prev) => {
                  const next = [...prev.definitions]
                  next[index] = { ...next[index], translation: e.target.value }
                  return { ...prev, definitions: next }
                })
              }
              placeholder="中文释义"
            />
            <button
              type="button"
              className="notfound-row-remove"
              aria-label="删除释义"
              disabled={draft.definitions.length <= 1}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  definitions: prev.definitions.filter((_, i) => i !== index),
                }))
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="notfound-add-row"
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              definitions: [...prev.definitions, { pos: '', translation: '' }],
            }))
          }
        >
          + 添加释义
        </button>
      </div>

      <div className="notfound-word-field">
        <span>词形变体（可选）</span>
        {draft.forms.map((form, index) => (
          <div key={`form-${index}`} className="notfound-def-row">
            <input
              className="notfound-def-pos"
              value={form.label}
              onChange={(e) =>
                setDraft((prev) => {
                  const next = [...prev.forms]
                  next[index] = { ...next[index], label: e.target.value }
                  return { ...prev, forms: next }
                })
              }
              placeholder="标签"
            />
            <input
              className="notfound-def-tr"
              value={form.value}
              onChange={(e) =>
                setDraft((prev) => {
                  const next = [...prev.forms]
                  next[index] = { ...next[index], value: e.target.value }
                  return { ...prev, forms: next }
                })
              }
              placeholder="词形"
            />
            <button
              type="button"
              className="notfound-row-remove"
              aria-label="删除变体"
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  forms: prev.forms.filter((_, i) => i !== index),
                }))
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="notfound-add-row"
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              forms: [...prev.forms, { label: '', value: '' }],
            }))
          }
        >
          + 添加变体
        </button>
      </div>

      {error ? <p className="notfound-word-error">{error}</p> : null}

      <div className="notfound-word-actions">
        <button type="button" className="notfound-word-btn" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="notfound-word-btn notfound-word-btn-primary"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? '保存中…' : '保存到词典缓存'}
        </button>
      </div>

      {pasteOpen ? (
        <DoubaoPasteSheet onClose={() => setPasteOpen(false)} onConfirm={handlePasteConfirm} />
      ) : null}
    </div>
  )
}

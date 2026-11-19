import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { EXAM_LEVEL_OPTIONS, formatExamLevelLabel } from '../../lib/examLevel'
import {
  saveManualWordEntry,
  type ManualWordDraft,
} from '../../services/dictionary/manualWord'
import type { WordEntry } from '../../services/dictionary'
import {
  ensureWordLemmaForRelation,
  linkRelatedLemmas,
  listRelatedLemmas,
  unlinkLemmaFromClique,
  type WordCliqueKind,
} from '../../services/words/wordCliques'
import { getWordNote, setWordNote } from '../../services/words/wordNotes'

interface WordEnrichmentEditorProps {
  lemma: string
  seedEntry?: WordEntry | null
  onClose: () => void
  onSaved: () => void
}

function entryToDraft(lemma: string, entry?: WordEntry | null): ManualWordDraft {
  if (!entry) {
    return {
      lemma,
      phoneticUs: '',
      phoneticUk: '',
      examLevels: [],
      definitions: [{ pos: '', translation: '' }],
      forms: [],
    }
  }
  return {
    lemma: entry.lemma || lemma,
    phoneticUs: entry.phoneticUs || '',
    phoneticUk: entry.phoneticUk || '',
    examLevels: [...(entry.examLevels || [])],
    definitions: entry.definitions?.length
      ? entry.definitions.map((d) => ({ pos: d.pos || '', translation: d.translation }))
      : [{ pos: '', translation: '' }],
    forms: (entry.forms || []).map((f) => ({ label: f.label, value: f.value })),
  }
}

export function WordEnrichmentEditor({
  lemma,
  seedEntry,
  onClose,
  onSaved,
}: WordEnrichmentEditorProps) {
  const [draft, setDraft] = useState<ManualWordDraft>(() => entryToDraft(lemma, seedEntry))
  const [lookalikes, setLookalikes] = useState<string[]>([])
  const [synonyms, setSynonyms] = useState<string[]>([])
  const [noteText, setNoteText] = useState('')
  const [addLookalike, setAddLookalike] = useState('')
  const [addSynonym, setAddSynonym] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyKind, setBusyKind] = useState<WordCliqueKind | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refreshRelations = useCallback(async () => {
    const [la, sy, note] = await Promise.all([
      listRelatedLemmas('lookalike', lemma),
      listRelatedLemmas('synonym', lemma),
      getWordNote(lemma),
    ])
    setLookalikes(la)
    setSynonyms(sy)
    setNoteText(note?.text ?? '')
  }, [lemma])

  useEffect(() => {
    setDraft(entryToDraft(lemma, seedEntry))
    void refreshRelations()
  }, [lemma, seedEntry, refreshRelations])

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

  async function handleAddRelation(kind: WordCliqueKind, raw: string) {
    setError('')
    setMessage('')
    const input = raw.trim()
    if (!input) {
      setError('请输入要添加的单词')
      return
    }
    setBusyKind(kind)
    try {
      const target = await ensureWordLemmaForRelation(input)
      const next = await linkRelatedLemmas(kind, lemma, target)
      if (kind === 'lookalike') {
        setLookalikes(next)
        setAddLookalike('')
      } else {
        setSynonyms(next)
        setAddSynonym('')
      }
      setMessage(`已添加「${target}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败')
    } finally {
      setBusyKind(null)
    }
  }

  async function handleRemoveRelation(kind: WordCliqueKind, related: string) {
    setError('')
    setMessage('')
    if (!window.confirm(`将「${related}」从整组中移除？同组其它词也会与它断开。`)) return
    try {
      await unlinkLemmaFromClique(kind, related)
      await refreshRelations()
      setMessage(`已移除「${related}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除失败')
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const cleaned: ManualWordDraft = {
        ...draft,
        lemma,
        definitions: draft.definitions.filter((item) => item.translation.trim()),
        forms: draft.forms.filter((item) => item.label.trim() && item.value.trim()),
      }
      if (!cleaned.definitions.length) {
        throw new Error('请至少填写一条释义')
      }
      await saveManualWordEntry(cleaned)
      await setWordNote(lemma, noteText)
      setMessage('已保存')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="word-enrich-mask" onClick={onClose}>
      <div
        className="word-enrich-sheet"
        role="dialog"
        aria-label="编辑单词"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="word-enrich-header">
          <button type="button" className="word-enrich-back" onClick={onClose}>
            关闭
          </button>
          <h2>编辑「{lemma}」</h2>
          <button
            type="button"
            className="word-enrich-save"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </header>

        <div className="word-enrich-body">
          <p className="settings-section-note">
            可改音标、等级、释义；并维护形近词、义近词与单词笔记。保存后写入词典缓存。
          </p>

          <label className="notfound-word-field">
            <span>美音音标</span>
            <input
              value={draft.phoneticUs}
              onChange={(e) => setDraft((prev) => ({ ...prev, phoneticUs: e.target.value }))}
              placeholder="如 bɪr"
            />
          </label>
          <label className="notfound-word-field">
            <span>英音音标</span>
            <input
              value={draft.phoneticUk}
              onChange={(e) => setDraft((prev) => ({ ...prev, phoneticUk: e.target.value }))}
              placeholder="如 bɪə"
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

          <RelationEditor
            title="形近词"
            items={lookalikes}
            input={addLookalike}
            busy={busyKind === 'lookalike'}
            onInputChange={setAddLookalike}
            onAdd={() => void handleAddRelation('lookalike', addLookalike)}
            onRemove={(item) => void handleRemoveRelation('lookalike', item)}
          />

          <RelationEditor
            title="义近词"
            items={synonyms}
            input={addSynonym}
            busy={busyKind === 'synonym'}
            onInputChange={setAddSynonym}
            onAdd={() => void handleAddRelation('synonym', addSynonym)}
            onRemove={(item) => void handleRemoveRelation('synonym', item)}
          />

          <label className="notfound-word-field">
            <span>单词笔记</span>
            <textarea
              className="word-enrich-note"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="可选，一段文字备注"
            />
          </label>

          {error ? <p className="notfound-word-error">{error}</p> : null}
          {message ? <p className="tools-success">{message}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function RelationEditor({
  title,
  items,
  input,
  busy,
  onInputChange,
  onAdd,
  onRemove,
}: {
  title: string
  items: string[]
  input: string
  busy: boolean
  onInputChange: (value: string) => void
  onAdd: () => void
  onRemove: (item: string) => void
}) {
  return (
    <div className="notfound-word-field word-enrich-relation">
      <span>{title}</span>
      {items.length ? (
        <ul className="word-enrich-relation-list">
          {items.map((item) => (
            <li key={item}>
              <strong>{item}</strong>
              <button type="button" onClick={() => onRemove(item)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-section-note">暂无</p>
      )}
      <div className="word-enrich-relation-add">
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={`输入${title}后添加`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAdd()
            }
          }}
        />
        <button type="button" className="tools-secondary-btn" disabled={busy} onClick={onAdd}>
          {busy ? '查询中…' : '添加'}
        </button>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { EXAM_LEVEL_OPTIONS, formatExamLevelLabel } from '../../lib/examLevel'
import {
  saveManualWordEntry,
  type ManualWordDraft,
} from '../../services/dictionary/manualWord'
import {
  lookupLocalWord,
  lookupOnlineWord,
  type WordEntry,
} from '../../services/dictionary'
import { setCachedWord } from '../../services/dictionary/cache'
import {
  ensureWordLemmaForRelation,
  linkRelatedLemmas,
  listRelatedLemmas,
  unlinkLemmaFromClique,
  type WordCliqueKind,
} from '../../services/words/wordCliques'
import { clearWordNote, getWordNote, setWordNote } from '../../services/words/wordNotes'

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
  const [restoring, setRestoring] = useState(false)
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

  async function clearAllRelations(kind: WordCliqueKind) {
    const items = kind === 'lookalike' ? lookalikes : synonyms
    for (const item of items) {
      await unlinkLemmaFromClique(kind, item)
    }
    // 自己也踢出组，确保干净
    await unlinkLemmaFromClique(kind, lemma)
  }

  async function handleRestore() {
    if (
      !window.confirm(
        '一键恢复将重新拉取词典释义（网络优先，失败用本地），并清空形近词、义近词与单词笔记。是否继续？',
      )
    ) {
      return
    }
    setRestoring(true)
    setError('')
    setMessage('')
    try {
      await clearAllRelations('lookalike')
      await clearAllRelations('synonym')
      await clearWordNote(lemma)

      let restored: WordEntry | null = null
      try {
        restored = await lookupOnlineWord(lemma, { forceRefresh: true })
      } catch {
        restored = null
      }
      if (!restored) {
        restored = await lookupLocalWord(lemma)
        if (restored) await setCachedWord(restored)
      }
      if (!restored) throw new Error('无法恢复：网络与本地均未找到该词')

      setDraft(entryToDraft(lemma, restored))
      setLookalikes([])
      setSynonyms([])
      setNoteText('')
      setMessage(restored.source === 'ecdict' ? '已恢复为本地词典释义' : '已恢复为网络释义')
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败')
    } finally {
      setRestoring(false)
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
          <section className="word-enrich-card">
            <h3 className="word-enrich-card-title">音标与等级</h3>
            <div className="word-enrich-grid-2">
              <label className="word-enrich-field">
                <span>美音音标</span>
                <input
                  value={draft.phoneticUs}
                  onChange={(e) => setDraft((prev) => ({ ...prev, phoneticUs: e.target.value }))}
                  placeholder="如 bɪr"
                />
              </label>
              <label className="word-enrich-field">
                <span>英音音标</span>
                <input
                  value={draft.phoneticUk}
                  onChange={(e) => setDraft((prev) => ({ ...prev, phoneticUk: e.target.value }))}
                  placeholder="如 bɪə"
                />
              </label>
            </div>
            <div className="word-enrich-field">
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
          </section>

          <section className="word-enrich-card">
            <h3 className="word-enrich-card-title">释义</h3>
            {draft.definitions.map((def, index) => (
              <div key={`def-${index}`} className="word-enrich-row">
                <input
                  className="word-enrich-pos"
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
                  className="word-enrich-flex"
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
                  className="word-enrich-icon-btn"
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
              className="word-enrich-link-btn"
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  definitions: [...prev.definitions, { pos: '', translation: '' }],
                }))
              }
            >
              + 添加释义
            </button>
          </section>

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

          <section className="word-enrich-card">
            <div className="word-enrich-card-head">
              <h3 className="word-enrich-card-title">单词笔记</h3>
              <button
                type="button"
                className="word-enrich-link-btn"
                disabled={!noteText.trim()}
                onClick={() => setNoteText('')}
              >
                一键清空
              </button>
            </div>
            <textarea
              className="word-enrich-note"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="可选，一段文字备注"
            />
          </section>

          {error ? <p className="notfound-word-error">{error}</p> : null}
          {message ? <p className="tools-success">{message}</p> : null}

          <button
            type="button"
            className="word-enrich-restore-btn"
            disabled={restoring || saving}
            onClick={() => void handleRestore()}
          >
            {restoring ? '恢复中…' : '一键恢复（网络优先 → 本地词典）'}
          </button>
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
    <section className="word-enrich-card">
      <h3 className="word-enrich-card-title">{title}</h3>
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
          {busy ? '…' : '添加'}
        </button>
      </div>
    </section>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { CollapsibleSettingsSection } from '../settings/CollapsibleSettingsSection'
import { NOTEBOOK_DATA_CHANGED } from '../../services/notes/events'
import {
  createNoteTag,
  deleteNoteTag,
  findEntriesByTagId,
  listNoteTags,
  renameNoteTag,
  type NoteTag,
  type TaggedNoteHit,
} from '../../services/notes/tags'

export function NoteTagsTool() {
  const [tags, setTags] = useState<NoteTag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [hits, setHits] = useState<TaggedNoteHit[]>([])
  const [hitsLoading, setHitsLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setTags(await listNoteTags())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onChanged = () => void refresh()
    window.addEventListener(NOTEBOOK_DATA_CHANGED, onChanged)
    return () => window.removeEventListener(NOTEBOOK_DATA_CHANGED, onChanged)
  }, [refresh])

  useEffect(() => {
    if (!selectedTagId) {
      setHits([])
      return
    }
    let cancelled = false
    setHitsLoading(true)
    void findEntriesByTagId(selectedTagId)
      .then((next) => {
        if (!cancelled) setHits(next)
      })
      .finally(() => {
        if (!cancelled) setHitsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTagId, tags])

  async function handleCreate() {
    setError('')
    setMessage('')
    const input = window.prompt('新标签名称', '')
    if (input === null) return
    try {
      const tag = await createNoteTag(input)
      await refresh()
      setMessage(`已创建「${tag.name}」`)
      setSelectedTagId(tag.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    }
  }

  async function handleRename(tag: NoteTag) {
    setError('')
    setMessage('')
    const input = window.prompt('重命名标签', tag.name)
    if (input === null) return
    try {
      const next = await renameNoteTag(tag.id, input)
      await refresh()
      setMessage(`已重命名为「${next.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名失败')
    }
  }

  async function handleDelete(tag: NoteTag) {
    setError('')
    setMessage('')
    if (!window.confirm(`删除标签「${tag.name}」？已打该标签的笔记会自动去掉此标签。`)) return
    try {
      await deleteNoteTag(tag.id)
      if (selectedTagId === tag.id) setSelectedTagId(null)
      await refresh()
      setMessage(`已删除「${tag.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const selectedTag = tags.find((tag) => tag.id === selectedTagId) ?? null

  return (
    <CollapsibleSettingsSection
      title="笔记标签"
      summary="创建标签；查看某标签下的笔记"
      defaultExpanded={false}
    >
      <p className="settings-section-note">
        先在这里维护标签，再到笔记详情或存笔记后勾选。系统本不可直接打标，但
        base_sentence 中的镜像可通过标签查询到。
      </p>

      <div className="note-tags-toolbar">
        <button type="button" className="tools-primary-btn" onClick={() => void handleCreate()}>
          新建标签
        </button>
        <button type="button" className="tools-secondary-btn" onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      {loading ? <p className="settings-section-note">加载中…</p> : null}
      {error ? <p className="tools-error">{error}</p> : null}
      {message ? <p className="tools-success">{message}</p> : null}

      {!loading && tags.length === 0 ? (
        <p className="settings-section-note">还没有标签，点「新建标签」开始。</p>
      ) : (
        <ul className="note-tags-list">
          {tags.map((tag) => (
            <li key={tag.id} className={`note-tags-item${selectedTagId === tag.id ? ' active' : ''}`}>
              <button
                type="button"
                className="note-tags-item-main"
                onClick={() => setSelectedTagId(tag.id)}
              >
                <strong>{tag.name}</strong>
              </button>
              <div className="note-tags-item-actions">
                <button type="button" onClick={() => void handleRename(tag)}>
                  改名
                </button>
                <button type="button" onClick={() => void handleDelete(tag)}>
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selectedTag ? (
        <div className="note-tags-hits">
          <h4 className="reader-settings-subtitle">标签「{selectedTag.name}」下的笔记</h4>
          {hitsLoading ? <p className="settings-section-note">查询中…</p> : null}
          {!hitsLoading && hits.length === 0 ? (
            <p className="settings-section-note">暂无笔记使用该标签。</p>
          ) : null}
          <ul className="note-tags-hit-list">
            {hits.map((hit) => (
              <li key={`${hit.notebookId}:${hit.entry.id}`}>
                <span className="note-tags-hit-nb">{hit.notebookTitle}</span>
                <p className="note-tags-hit-sentence">{hit.entry.sentence}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </CollapsibleSettingsSection>
  )
}

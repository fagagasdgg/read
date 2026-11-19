import { useCallback, useEffect, useMemo, useState } from 'react'
import { CollapsibleSettingsSection } from '../settings/CollapsibleSettingsSection'
import { ListPager, TAG_LIST_PAGE_SIZE, paginateItems } from '../common/ListPager'
import { NOTEBOOK_DATA_CHANGED } from '../../services/notes/events'
import {
  countEntriesByTagId,
  createNoteTag,
  deleteNoteTag,
  listNoteTags,
  renameNoteTag,
  type NoteTag,
} from '../../services/notes/tags'

export function NoteTagsTool() {
  const [tags, setTags] = useState<NoteTag[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [tagList, tagCounts] = await Promise.all([listNoteTags(), countEntriesByTagId()])
      setTags(tagList)
      setCounts(tagCounts)
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

  const { pageItems, page: safePage, totalPages } = useMemo(
    () => paginateItems(tags, page, TAG_LIST_PAGE_SIZE),
    [tags, page],
  )

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  async function handleCreate() {
    setError('')
    setMessage('')
    const input = window.prompt('新标签名称', '')
    if (input === null) return
    try {
      const tag = await createNoteTag(input)
      await refresh()
      setMessage(`已创建「${tag.name}」`)
      // 新建后尽量跳到包含该标签的页
      const nextTags = await listNoteTags()
      const index = nextTags.findIndex((item) => item.id === tag.id)
      if (index >= 0) setPage(Math.floor(index / TAG_LIST_PAGE_SIZE) + 1)
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
      await refresh()
      setMessage(`已删除「${tag.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <CollapsibleSettingsSection
      title="笔记标签"
      summary="创建标签；标签后显示关联笔记数量"
      defaultExpanded={false}
    >
      <p className="settings-section-note">
        先在这里维护标签，再到笔记详情或存笔记后勾选。系统本不可直接打标；按标签筛选时不包含
        base_sentence 镜像。
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
        <>
          <ul className="note-tags-list">
            {pageItems.map((tag, index) => {
              const order = (safePage - 1) * TAG_LIST_PAGE_SIZE + index + 1
              const count = counts[tag.id] ?? 0
              return (
                <li key={tag.id} className="note-tags-item">
                  <div className="note-tags-item-main note-tags-item-main-static">
                    <span className="note-tags-item-index">{order}</span>
                    <strong>{tag.name}</strong>
                    <span className="note-tags-item-count">{count} 条</span>
                  </div>
                  <div className="note-tags-item-actions">
                    <button type="button" onClick={() => void handleRename(tag)}>
                      改名
                    </button>
                    <button type="button" onClick={() => void handleDelete(tag)}>
                      删除
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <ListPager
            page={safePage}
            totalPages={totalPages}
            totalItems={tags.length}
            pageSize={TAG_LIST_PAGE_SIZE}
            onPageChange={setPage}
            label="个标签"
          />
        </>
      )}
    </CollapsibleSettingsSection>
  )
}

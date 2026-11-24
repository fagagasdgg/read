import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NoteTag } from '../../services/notes/tags'
import { ListPager, TAG_LIST_PAGE_SIZE, paginateItems } from '../common/ListPager'

interface TagFilterSheetProps {
  open: boolean
  tags: NoteTag[]
  counts?: Record<string, number>
  /** 已确认的筛选标签（可多选） */
  value: string[]
  onClose: () => void
  /** 确认筛选结果；空数组表示回到全部笔记本 */
  onConfirm: (tagIds: string[]) => void
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

/** 居中标签多选面板：点击切换选中，再点取消；底部确认 */
export function TagFilterSheet({
  open,
  tags,
  counts = {},
  value,
  onClose,
  onConfirm,
}: TagFilterSheetProps) {
  const [page, setPage] = useState(1)
  const [draftIds, setDraftIds] = useState<string[]>(value)

  useEffect(() => {
    if (!open) return
    setDraftIds(value)
    const firstSelected = value.find((id) => tags.some((tag) => tag.id === id))
    const index = firstSelected ? tags.findIndex((tag) => tag.id === firstSelected) : -1
    if (index >= 0) {
      setPage(Math.floor(index / TAG_LIST_PAGE_SIZE) + 1)
    } else {
      setPage(1)
    }
  }, [open, tags, value])

  const { pageItems, page: safePage, totalPages } = useMemo(
    () => paginateItems(tags, page, TAG_LIST_PAGE_SIZE),
    [tags, page],
  )

  const selectedTags = useMemo(() => {
    const byId = new Map(tags.map((tag) => [tag.id, tag]))
    return draftIds
      .map((id) => byId.get(id))
      .filter((tag): tag is NoteTag => Boolean(tag))
  }, [draftIds, tags])

  if (!open) return null

  return createPortal(
    <div className="tag-filter-sheet-mask" onClick={onClose}>
      <div
        className="tag-filter-sheet"
        role="dialog"
        aria-label="选择标签"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tag-filter-sheet-header">
          <div className="tag-filter-sheet-header-text">
            <h3>按标签筛选</h3>
            <p className="tag-filter-sheet-sub">
              可多选；再点同一标签取消。筛选结果需同时包含所选标签。
            </p>
          </div>
          <button type="button" className="tag-filter-sheet-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        {selectedTags.length > 0 ? (
          <div className="tag-filter-selected-bar">
            <span className="tag-filter-selected-label">已选 {selectedTags.length}</span>
            <div className="tag-filter-selected-chips">
              {selectedTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="tag-filter-selected-chip"
                  onClick={() => setDraftIds((prev) => toggleId(prev, tag.id))}
                  title={`取消「${tag.name}」`}
                >
                  {tag.name}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="tag-filter-sheet-list">
          <button
            type="button"
            className={`tag-filter-option${draftIds.length === 0 ? ' active' : ''}`}
            onClick={() => setDraftIds([])}
          >
            <span className="tag-filter-option-index" aria-hidden>
              ·
            </span>
            <span className="tag-filter-option-name">全部笔记本</span>
            <span className="tag-filter-option-hint">不按标签筛选</span>
            {draftIds.length === 0 ? <span className="tag-filter-check">✓</span> : null}
          </button>

          {pageItems.map((tag, index) => {
            const order = (safePage - 1) * TAG_LIST_PAGE_SIZE + index + 1
            const count = counts[tag.id] ?? 0
            const active = draftIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                className={`tag-filter-option${active ? ' active' : ''}`}
                aria-pressed={active}
                onClick={() => setDraftIds((prev) => toggleId(prev, tag.id))}
              >
                <span className="tag-filter-option-index">{order}</span>
                <span className="tag-filter-option-name">{tag.name}</span>
                <span className="tag-filter-option-count">{count} 条</span>
                <span className={`tag-filter-check-box${active ? ' on' : ''}`} aria-hidden>
                  {active ? '✓' : ''}
                </span>
              </button>
            )
          })}

          {!tags.length ? (
            <p className="tag-filter-empty">还没有标签，请先到「工具 → 笔记标签」创建</p>
          ) : null}
        </div>

        <ListPager
          page={safePage}
          totalPages={totalPages}
          totalItems={tags.length}
          pageSize={TAG_LIST_PAGE_SIZE}
          onPageChange={setPage}
          label="个标签"
        />

        <footer className="tag-filter-sheet-footer">
          <button
            type="button"
            className="tag-filter-footer-btn muted"
            onClick={() => setDraftIds([])}
            disabled={draftIds.length === 0}
          >
            清空
          </button>
          <button
            type="button"
            className="tag-filter-footer-btn primary"
            onClick={() => {
              onConfirm(draftIds)
              onClose()
            }}
          >
            {draftIds.length ? `完成（${draftIds.length}）` : '完成'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

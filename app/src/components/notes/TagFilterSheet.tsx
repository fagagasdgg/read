import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NoteTag } from '../../services/notes/tags'
import { ListPager, TAG_LIST_PAGE_SIZE, paginateItems } from '../common/ListPager'

interface TagFilterSheetProps {
  open: boolean
  tags: NoteTag[]
  counts?: Record<string, number>
  value: string
  onClose: () => void
  onSelect: (tagId: string) => void
}

/** 居中标签选择面板：每页固定「全部笔记本」+ 10 条标签卡片 */
export function TagFilterSheet({
  open,
  tags,
  counts = {},
  value,
  onClose,
  onSelect,
}: TagFilterSheetProps) {
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!open) return
    const index = tags.findIndex((tag) => tag.id === value)
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
          <h3>按标签筛选</h3>
          <button type="button" className="tag-filter-sheet-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="tag-filter-sheet-list">
          <button
            type="button"
            className={`tag-filter-option${value === '' ? ' active' : ''}`}
            onClick={() => {
              onSelect('')
              onClose()
            }}
          >
            <span className="tag-filter-option-index" aria-hidden>
              ·
            </span>
            <span className="tag-filter-option-name">全部笔记本</span>
            {value === '' ? <span className="tag-filter-check">✓</span> : null}
          </button>

          {pageItems.map((tag, index) => {
            const order = (safePage - 1) * TAG_LIST_PAGE_SIZE + index + 1
            const count = counts[tag.id] ?? 0
            return (
              <button
                key={tag.id}
                type="button"
                className={`tag-filter-option${value === tag.id ? ' active' : ''}`}
                onClick={() => {
                  onSelect(tag.id)
                  onClose()
                }}
              >
                <span className="tag-filter-option-index">{order}</span>
                <span className="tag-filter-option-name">{tag.name}</span>
                <span className="tag-filter-option-count">{count} 条</span>
                {value === tag.id ? <span className="tag-filter-check">✓</span> : null}
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
      </div>
    </div>,
    document.body,
  )
}

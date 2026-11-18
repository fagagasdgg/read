import type { NoteTag } from '../../services/notes/tags'

interface NoteTagPickerProps {
  tags: NoteTag[]
  selectedIds: string[]
  onChange: (nextIds: string[]) => void
  disabled?: boolean
  emptyHint?: string
}

/** 从已有标签库多选；不可在此新建 */
export function NoteTagPicker({
  tags,
  selectedIds,
  onChange,
  disabled,
  emptyHint = '还没有标签，请先到「工具 → 笔记标签」创建',
}: NoteTagPickerProps) {
  function toggle(id: string) {
    if (disabled) return
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id))
      return
    }
    onChange([...selectedIds, id])
  }

  if (!tags.length) {
    return <p className="note-tag-picker-empty">{emptyHint}</p>
  }

  return (
    <div className="note-tag-picker">
      {tags.map((tag) => {
        const active = selectedIds.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            className={`note-tag-chip${active ? ' active' : ''}`}
            disabled={disabled}
            onClick={() => toggle(tag.id)}
          >
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}

export function NoteTagChips({
  tags,
  tagIds,
}: {
  tags: NoteTag[]
  tagIds?: string[]
}) {
  if (!tagIds?.length) return null
  const byId = new Map(tags.map((tag) => [tag.id, tag]))
  const named = tagIds.map((id) => byId.get(id)?.name).filter(Boolean) as string[]
  if (!named.length) return null
  return (
    <div className="note-tag-chips-readonly">
      {named.map((name) => (
        <span key={name} className="note-tag-chip readonly">
          {name}
        </span>
      ))}
    </div>
  )
}

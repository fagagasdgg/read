import type { InBookNoteMark } from './useInBookNoteMarks'
import type { NotebookEntry } from '../../services/notes/notebooks'

interface InBookNoteUnderlineLayerProps {
  marks: InBookNoteMark[]
  color: string
  onNoteTap: (entry: NotebookEntry) => void
}

/** 正文下方可点热区：点线看笔记，不挡住单词点击 */
export function InBookNoteUnderlineLayer({
  marks,
  color,
  onNoteTap,
}: InBookNoteUnderlineLayerProps) {
  if (!marks.length) return null

  return (
    <div className="reader-note-underline-layer" aria-hidden>
      {marks.map((mark) =>
        mark.rects.map((rect, index) => (
          <button
            key={`${mark.key}-${index}`}
            type="button"
            className="reader-note-underline"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderBottomColor: color,
            }}
            aria-label="查看笔记"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onNoteTap(mark.entry)
            }}
          />
        )),
      )}
    </div>
  )
}

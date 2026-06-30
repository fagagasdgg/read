import type { EpubChapter } from '../../services/epub'

interface TocPanelProps {
  chapters: EpubChapter[]
  currentIndex: number
  onClose: () => void
  onSelectChapter: (index: number) => void
}

export function TocPanel({ chapters, currentIndex, onClose, onSelectChapter }: TocPanelProps) {
  return (
    <div className="reader-overlay" onClick={onClose}>
      <div className="reader-side-panel" onClick={(e) => e.stopPropagation()}>
        <div className="reader-side-tabs">
          <span className="reader-side-tab active">目录</span>
          <span className="reader-side-tab muted">笔记</span>
        </div>

        <ul className="reader-toc-list">
          {chapters.map((ch) => (
            <li key={ch.id}>
              <button
                type="button"
                className={ch.index === currentIndex ? 'active' : ''}
                onClick={() => {
                  onSelectChapter(ch.index)
                  onClose()
                }}
              >
                {ch.title}
              </button>
            </li>
          ))}
        </ul>

        <p className="reader-toc-hint">笔记功能将在后续版本开放</p>
      </div>
    </div>
  )
}

import { normalizeAnalysisListField } from '../../services/llm/analysisParse'
import type { NotebookEntry } from '../../services/notes/notebooks'

interface NoteDetailPopupProps {
  entry: NotebookEntry | null
  onClose: () => void
}

export function NoteDetailPopup({ entry, onClose }: NoteDetailPopupProps) {
  if (!entry) return null

  const translation = entry.analysis.translation?.trim()
  const collocations = normalizeAnalysisListField(
    entry.analysis.collocations || '',
    'collocations',
  ).trim()
  const slangs = normalizeAnalysisListField(entry.analysis.slangs || '', 'slangs').trim()
  const sentencePattern = entry.analysis.sentencePattern?.trim()
  const hasBody = Boolean(translation || collocations || slangs || sentencePattern)

  return (
    <div className="popup-mask note-popup-mask" onClick={onClose}>
      <div
        className="note-popup"
        role="dialog"
        aria-label="笔记详情"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="note-popup-header">
          <h3 className="note-popup-title">笔记</h3>
          <button type="button" className="popup-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="note-popup-body">
          <section className="note-popup-block">
            <h4 className="note-popup-label">原文</h4>
            <p className="note-popup-sentence">{entry.sentence}</p>
          </section>

          {translation ? (
            <section className="note-popup-block">
              <h4 className="note-popup-label">翻译</h4>
              <p>{translation}</p>
            </section>
          ) : null}

          {collocations && collocations !== '无' ? (
            <section className="note-popup-block">
              <h4 className="note-popup-label">搭配</h4>
              <p className="note-popup-pre">{collocations}</p>
            </section>
          ) : null}

          {slangs && slangs !== '无' ? (
            <section className="note-popup-block">
              <h4 className="note-popup-label">俚语</h4>
              <p className="note-popup-pre">{slangs}</p>
            </section>
          ) : null}

          {sentencePattern ? (
            <section className="note-popup-block">
              <h4 className="note-popup-label">句型</h4>
              <p className="note-popup-pre">{sentencePattern}</p>
            </section>
          ) : null}

          {!hasBody ? (
            <p className="note-popup-empty">这条笔记还没有解析内容。</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { EpubChapter } from '../../services/epub'

interface TocPanelProps {
  chapters: EpubChapter[]
  currentIndex: number
  onClose: () => void
  onSelectChapter: (index: number) => void
}

type TocTab = 'toc' | 'notes'

export function TocPanel({ chapters, currentIndex, onClose, onSelectChapter }: TocPanelProps) {
  const [tab, setTab] = useState<TocTab>('toc')

  return (
    <div className="reader-overlay" onClick={onClose}>
      <div className="reader-side-panel" onClick={(e) => e.stopPropagation()}>
        <div className="reader-side-tabs">
          <button
            type="button"
            className={`reader-side-tab${tab === 'toc' ? ' active' : ''}`}
            onClick={() => setTab('toc')}
          >
            目录
          </button>
          <button
            type="button"
            className={`reader-side-tab${tab === 'notes' ? ' active' : ''}`}
            onClick={() => setTab('notes')}
          >
            笔记
          </button>
        </div>

        {tab === 'toc' ? (
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
        ) : (
          <div className="reader-notes-empty">
            <p className="reader-notes-empty-title">暂无笔记</p>
            <p className="reader-notes-empty-desc">
              长按选段划线、添加想法等功能将在后续版本开放。届时可在此查看全书笔记与跳转。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

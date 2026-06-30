import { useEffect, useState } from 'react'
import { lookupWord } from '../../services/dictionary'
import type { WordEntry } from '../../services/dictionary'

interface WordDetailPopupProps {
  rawWord: string | null
  onClose: () => void
  onLookupVariant?: (word: string) => void
}

export function WordDetailPopup({ rawWord, onClose, onLookupVariant }: WordDetailPopupProps) {
  const [loading, setLoading] = useState(false)
  const [entry, setEntry] = useState<WordEntry | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!rawWord) {
      setEntry(null)
      setError('')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    lookupWord(rawWord)
      .then((result) => {
        if (cancelled) return
        setEntry(result)
        if (!result) setError('未找到该词的释义')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '查询失败')
        setEntry(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [rawWord])

  if (!rawWord) return null

  return (
    <div className="popup-mask" onClick={onClose}>
      <div className="word-popup" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="popup-close" onClick={onClose} aria-label="关闭">
          ×
        </button>

        {loading && <p className="popup-loading">查询中…</p>}
        {error && <p className="popup-error">{error}</p>}

        {entry && (
          <>
            <div className="popup-word-title">
              <strong>{entry.lemma}</strong>
              <span className="popup-phonetic">/{entry.phoneticUs || entry.phoneticUk}/</span>
              <a className="popup-audio" href={entry.usSpeechUrl} target="_blank" rel="noreferrer">
                🔊 美音
              </a>
            </div>

            {entry.examLevels.length > 0 && (
              <p className="popup-levels">等级: {entry.examLevels.join(' / ')}</p>
            )}

            <ul className="popup-defs">
              {entry.definitions.map((def, i) => (
                <li key={`${def.pos}-${i}`}>
                  {def.pos && <span className="pos">{def.pos}</span>}
                  {def.translation}
                </li>
              ))}
            </ul>

            {entry.forms.length > 0 && (
              <div className="popup-forms">
                <span>变体：</span>
                {entry.forms.map((form) => (
                  <button
                    key={`${form.label}-${form.value}`}
                    type="button"
                    className="form-chip"
                    onClick={() => onLookupVariant?.(form.value)}
                  >
                    {form.label}: {form.value}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

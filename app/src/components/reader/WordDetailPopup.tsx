import { useEffect, useState } from 'react'
import { extractVariantLookupWord } from '../../lib/variantToken'
import { lookupWordDetailed, playSpeechWord } from '../../services/dictionary'
import type { WordEntry } from '../../services/dictionary'

export interface WordLookupRequest {
  word: string
  exactToken: boolean
  seq: number
}

interface WordDetailPopupProps {
  lookup: WordLookupRequest | null
  onClose: () => void
  onLookupVariant?: (word: string) => void
}

export function WordDetailPopup({ lookup, onClose, onLookupVariant }: WordDetailPopupProps) {
  const [loading, setLoading] = useState(false)
  const [entry, setEntry] = useState<WordEntry | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!lookup) {
      setEntry(null)
      setFromCache(false)
      setError('')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setEntry(null)
    setFromCache(false)

    lookupWordDetailed(lookup.word, { exactToken: lookup.exactToken })
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setError('未找到该词的释义')
          return
        }
        setEntry(result.entry)
        setFromCache(result.fromCache)
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
  }, [lookup])

  if (!lookup) return null

  return (
    <div className="popup-mask" onClick={onClose}>
      <div className="word-popup" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="popup-close" onClick={onClose} aria-label="关闭">
          ×
        </button>

        {loading && <p className="popup-loading">查询中…</p>}
        {error && <p className="popup-error">{error}</p>}

        {entry && !loading && (
          <>
            <p className="popup-source">{fromCache ? '来源：本地缓存' : '来源：网络查询'}</p>
            <div className="popup-word-title">
              <strong>{entry.lemma}</strong>
            </div>

            <div className="popup-phonetics">
              {(entry.phoneticUs || entry.usSpeechUrl) && (
                <div className="popup-phonetic-row">
                  <span className="popup-phonetic-label">美</span>
                  <span className="popup-phonetic">/{entry.phoneticUs}/</span>
                  <button
                    type="button"
                    className="popup-audio-btn"
                    aria-label="播放美音"
                    onClick={() => playSpeechWord(entry.lemma, 2)}
                  >
                    🔊
                  </button>
                </div>
              )}
              <div className="popup-phonetic-row">
                <span className="popup-phonetic-label">英</span>
                <span className="popup-phonetic">/{entry.phoneticUk}/</span>
                <button
                  type="button"
                  className="popup-audio-btn"
                  aria-label="播放英音"
                  onClick={() => playSpeechWord(entry.lemma, 1)}
                >
                  🔊
                </button>
              </div>
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
                    onClick={(e) => {
                      e.stopPropagation()
                      const token = extractVariantLookupWord(form.value)
                      if (token) onLookupVariant?.(token)
                    }}
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

import { useEffect, useState } from 'react'
import { extractVariantLookupWord } from '../../lib/variantToken'
import {
  lookupWord,
  playSpeech,
  playSpeechWord,
  getDictionarySourceLabel,
} from '../../services/dictionary'
import type { WordEntry } from '../../services/dictionary'
import { isMasteredLemma, setMasteredLemma } from '../../services/words/mastered'

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
  const [error, setError] = useState('')
  const [mastered, setMastered] = useState(false)
  const [masteredSaving, setMasteredSaving] = useState(false)

  useEffect(() => {
    if (!lookup) {
      setEntry(null)
      setError('')
      setMastered(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setEntry(null)
    setMastered(false)

    lookupWord(lookup.word, { exactToken: lookup.exactToken })
      .then(async (result) => {
        if (cancelled) return
        setEntry(result)
        if (!result) {
          setError('未找到该词的释义')
          return
        }
        const marked = await isMasteredLemma(result.lemma)
        if (!cancelled) setMastered(marked)
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

  async function toggleMastered() {
    if (!entry || masteredSaving) return
    const next = !mastered
    setMasteredSaving(true)
    try {
      await setMasteredLemma(entry.lemma, next)
      setMastered(next)
    } finally {
      setMasteredSaving(false)
    }
  }

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
            <div className="popup-word-title">
              <strong>{entry.lemma}</strong>
              <span className="popup-source">来源：{getDictionarySourceLabel(entry.source)}</span>
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
                    onClick={() => {
                      if (entry.source === 'iciba' && entry.usSpeechUrl) playSpeech(entry.usSpeechUrl)
                      else playSpeechWord(entry.lemma, 2)
                    }}
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
                  onClick={() => {
                    if (entry.source === 'iciba' && entry.ukSpeechUrl) playSpeech(entry.ukSpeechUrl)
                    else playSpeechWord(entry.lemma, 1)
                  }}
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

            <div className="popup-actions">
              <button
                type="button"
                className={`popup-mastered-btn${mastered ? ' active' : ''}`}
                onClick={() => void toggleMastered()}
                disabled={masteredSaving}
              >
                {mastered ? '已掌握（点击恢复行间翻译）' : '标记为已掌握'}
              </button>
              {mastered && (
                <p className="popup-mastered-note">该词将不再显示行间翻译，点词弹窗仍可查看释义。</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { formatExamLevelsDisplay } from '../../lib/examLevel'
import { normalizeWordToken } from '../../lib/lemmatize'
import { extractVariantLookupWord } from '../../lib/variantToken'
import {
  lookupWord,
  playSpeechWithFallback,
  playSpeechWord,
  getDictionarySourceLabel,
} from '../../services/dictionary'
import type { WordEntry } from '../../services/dictionary'
import { isMasteredLemma, setMasteredLemma } from '../../services/words/mastered'
import { WordPhraseSection } from './WordPhraseSection'

export interface WordLookupRequest {
  word: string
  exactToken: boolean
  seq: number
  /** 连字符复合词：index 0=整词，1..=各分段 */
  compound?: {
    full: string
    parts: string[]
    index: number
  }
}

interface WordDetailPopupProps {
  lookup: WordLookupRequest | null
  onClose: () => void
  onLookupVariant?: (word: string) => void
  onCompoundNavigate?: (next: WordLookupRequest) => void
}

export function WordDetailPopup({
  lookup,
  onClose,
  onLookupVariant,
  onCompoundNavigate,
}: WordDetailPopupProps) {
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
        const surface = normalizeWordToken(lookup.word)
        const marked =
          (await isMasteredLemma(result.lemma)) ||
          (surface !== result.lemma && (await isMasteredLemma(surface)))
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

  const compound = lookup.compound
  const compoundTotal = compound ? compound.parts.length + 1 : 0
  const compoundIndex = compound?.index ?? 0

  function goCompound(delta: number) {
    if (!compound || !onCompoundNavigate) return
    const nextIndex = Math.max(0, Math.min(compoundTotal - 1, compoundIndex + delta))
    if (nextIndex === compoundIndex) return
    const word = nextIndex === 0 ? compound.full : compound.parts[nextIndex - 1]
    onCompoundNavigate({
      word,
      exactToken: nextIndex > 0,
      seq: Date.now(),
      compound: { ...compound, index: nextIndex },
    })
  }

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

            {compound && compoundTotal > 1 && (
              <p className="popup-compound-hint">
                {compoundIndex === 0
                  ? '连字符词 · 整词'
                  : `连字符词 · 第 ${compoundIndex}/${compound.parts.length} 段`}
              </p>
            )}

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
                      if (entry.source === 'iciba' && entry.usSpeechUrl) {
                        playSpeechWithFallback(entry.usSpeechUrl, entry.lemma, 2)
                      } else {
                        playSpeechWord(entry.lemma, 2)
                      }
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
                    if (entry.source === 'iciba' && entry.ukSpeechUrl) {
                      playSpeechWithFallback(entry.ukSpeechUrl, entry.lemma, 1)
                    } else {
                      playSpeechWord(entry.lemma, 1)
                    }
                  }}
                >
                  🔊
                </button>
              </div>
            </div>

            {entry.examLevels.length > 0 && (
              <div className="popup-levels">
                <span className="popup-levels-label">等级</span>
                <div className="popup-level-chips">
                  {formatExamLevelsDisplay(entry.examLevels).map((label) => (
                    <span key={label} className="popup-level-chip">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {entry.frequency &&
              (entry.frequency.collinsStar !== undefined ||
                entry.frequency.examFrequency !== undefined) && (
              <div className="popup-frequency">
                {entry.frequency.collinsStar !== undefined && (
                  <span className="popup-freq-collins" aria-label={`柯林斯 ${entry.frequency.collinsStar} 星`}>
                    <span className="popup-freq-label">柯林斯</span>
                    <span className="popup-freq-stars" aria-hidden>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className={`popup-freq-star${i < entry.frequency!.collinsStar! ? ' on' : ''}`}
                        >
                          ★
                        </span>
                      ))}
                    </span>
                  </span>
                )}
                {entry.frequency.collinsStar !== undefined &&
                  entry.frequency.examFrequency !== undefined && (
                    <span className="popup-freq-sep" aria-hidden>
                      ·
                    </span>
                  )}
                {entry.frequency.examFrequency !== undefined && (
                  <span className="popup-freq-exam">
                    <span className="popup-freq-label">真题</span>
                    <strong className="popup-freq-num">{entry.frequency.examFrequency}</strong>
                    <span className="popup-freq-unit">次</span>
                  </span>
                )}
              </div>
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

            <WordPhraseSection lemma={entry.lemma} />

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

            {compound && compoundTotal > 1 && (
              <div className="popup-compound-nav">
                <button
                  type="button"
                  className="popup-compound-arrow"
                  aria-label="上一段"
                  disabled={compoundIndex <= 0}
                  onClick={() => goCompound(-1)}
                >
                  ‹
                </button>
                <span className="popup-compound-meta">
                  {compoundIndex + 1} / {compoundTotal}
                </span>
                <button
                  type="button"
                  className="popup-compound-arrow"
                  aria-label="下一段"
                  disabled={compoundIndex >= compoundTotal - 1}
                  onClick={() => goCompound(1)}
                >
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

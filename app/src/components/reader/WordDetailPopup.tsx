import { useEffect, useState } from 'react'
import { formatExamLevelsDisplay } from '../../lib/examLevel'
import { normalizeWordToken } from '../../lib/lemmatize'
import { extractVariantLookupWord } from '../../lib/variantToken'
import {
  getDictionarySourceLabel,
  lookupLocalWord,
  lookupOnlineWord,
  playSpeechWithFallback,
  playSpeechWord,
  resolveLemma,
} from '../../services/dictionary'
import type { WordEntry } from '../../services/dictionary'
import { getBookLemmaOccurrenceCount } from '../../services/tools/bookWordFrequency'
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
  bookId?: string
  onClose: () => void
  onLookupVariant?: (word: string) => void
  onCompoundNavigate?: (next: WordLookupRequest) => void
}

type PanelMode = 'local' | 'online'

export function WordDetailPopup({
  lookup,
  bookId,
  onClose,
  onLookupVariant,
  onCompoundNavigate,
}: WordDetailPopupProps) {
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<PanelMode>('local')
  const [localEntry, setLocalEntry] = useState<WordEntry | null>(null)
  const [onlineEntry, setOnlineEntry] = useState<WordEntry | null>(null)
  const [canonicalLemma, setCanonicalLemma] = useState('')
  const [error, setError] = useState('')
  const [onlineLoading, setOnlineLoading] = useState(false)
  const [onlineError, setOnlineError] = useState('')
  const [mastered, setMastered] = useState(false)
  const [masteredSaving, setMasteredSaving] = useState(false)
  const [bookOccurrence, setBookOccurrence] = useState<number | null>(null)

  useEffect(() => {
    if (!lookup) {
      setLocalEntry(null)
      setOnlineEntry(null)
      setCanonicalLemma('')
      setError('')
      setOnlineError('')
      setMastered(false)
      setBookOccurrence(null)
      setMode('local')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setOnlineError('')
    setLocalEntry(null)
    setOnlineEntry(null)
    setMastered(false)
    setBookOccurrence(null)
    setMode('local')

    const opts = { exactToken: lookup.exactToken }

    ;(async () => {
      try {
        const lemma = await resolveLemma(lookup.word, lookup.exactToken)
        const local = await lookupLocalWord(lookup.word, opts)
        if (cancelled) return

        const markKey = local?.lemma || lemma || normalizeWordToken(lookup.word)
        setCanonicalLemma(lemma || normalizeWordToken(lookup.word))
        setLocalEntry(local)

        if (local) {
          setMode('local')
          setLoading(false)

          const marked = markKey ? await isMasteredLemma(markKey) : false
          if (!cancelled) setMastered(marked)
          if (bookId && markKey) {
            const count = await getBookLemmaOccurrenceCount(bookId, markKey)
            if (!cancelled) setBookOccurrence(count)
          }

          // 本地释义先出；联网音标后台补齐（缓存优先）
          setOnlineLoading(true)
          try {
            const online = await lookupOnlineWord(lookup.word, opts)
            if (!cancelled) setOnlineEntry(online)
          } catch {
            // 音标失败不影响 ECDICT 释义
          } finally {
            if (!cancelled) setOnlineLoading(false)
          }
          return
        }

        // 无本地词条时自动拉联网（与旧版行为衔接）
        setMode('online')
        setOnlineLoading(true)
        try {
          const online = await lookupOnlineWord(lookup.word, opts)
          if (cancelled) return
          setOnlineEntry(online)
          if (!online) setError('未找到该词的释义')
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : '查询失败')
          }
        } finally {
          if (!cancelled) setOnlineLoading(false)
        }

        const marked = markKey ? await isMasteredLemma(markKey) : false
        if (!cancelled) setMastered(marked)
        if (bookId && markKey) {
          const count = await getBookLemmaOccurrenceCount(bookId, markKey)
          if (!cancelled) setBookOccurrence(count)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '查询失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [lookup, bookId])

  const entry = mode === 'local' ? localEntry : onlineEntry
  const showLoading = loading || (mode === 'online' && onlineLoading && !onlineEntry)

  async function toggleNetworkMode() {
    if (!lookup) return

    if (mode === 'local') {
      setMode('online')
      if (onlineEntry) return

      setOnlineLoading(true)
      setOnlineError('')
      try {
        const online = await lookupOnlineWord(lookup.word, {
          exactToken: lookup.exactToken,
        })
        setOnlineEntry(online)
        if (!online) setOnlineError('未找到网络释义')
      } catch (err) {
        setOnlineError(err instanceof Error ? err.message : '网络查询失败')
      } finally {
        setOnlineLoading(false)
      }
      return
    }

    // 切回本地
    if (localEntry) {
      setMode('local')
      setOnlineError('')
      return
    }
    setOnlineError('无本地词条可切换')
  }

  async function toggleMastered() {
    const markKey = canonicalLemma || entry?.lemma
    if (!markKey || masteredSaving) return
    const next = !mastered
    setMasteredSaving(true)
    try {
      await setMasteredLemma(markKey, next)
      setMastered(next)
    } finally {
      setMasteredSaving(false)
    }
  }

  if (!lookup) return null

  const compound = lookup.compound
  const compoundTotal = compound ? compound.parts.length + 1 : 0
  const compoundIndex = compound?.index ?? 0
  const canToggleNetwork = Boolean(localEntry)

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

  const displayLemma = entry?.lemma || canonicalLemma
  const speechLemma = onlineEntry?.lemma || displayLemma
  const hasLocalFreq =
    entry?.frequency &&
    (entry.frequency.collinsStar !== undefined ||
      entry.frequency.bnc !== undefined ||
      entry.frequency.frq !== undefined)
  const hasOnlineFreq =
    entry?.frequency &&
    (entry.frequency.collinsStar !== undefined || entry.frequency.examFrequency !== undefined)

  const onlineHasUs = Boolean(onlineEntry && (onlineEntry.phoneticUs || onlineEntry.usSpeechUrl))
  const onlineHasUk = Boolean(onlineEntry && (onlineEntry.phoneticUk || onlineEntry.ukSpeechUrl))
  const useOnlinePhonetics = Boolean(onlineEntry && (onlineHasUs || onlineHasUk))
  const localPhonetic = entry?.phoneticUk || entry?.phoneticUs || ''

  function playUs() {
    const src = onlineEntry
    if (src?.source === 'iciba' && src.usSpeechUrl) {
      playSpeechWithFallback(src.usSpeechUrl, src.lemma || speechLemma, 2)
      return
    }
    playSpeechWord(src?.lemma || speechLemma, 2)
  }

  function playUk() {
    const src = onlineEntry
    if (src?.source === 'iciba' && src.ukSpeechUrl) {
      playSpeechWithFallback(src.ukSpeechUrl, src.lemma || speechLemma, 1)
      return
    }
    playSpeechWord(src?.lemma || speechLemma, 1)
  }

  return (
    <div className="popup-mask" onClick={onClose}>
      <div className="word-popup" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="popup-close" onClick={onClose} aria-label="关闭">
          ×
        </button>

        {showLoading && <p className="popup-loading">查询中…</p>}
        {error && !entry && <p className="popup-error">{error}</p>}
        {onlineError && mode === 'online' && !onlineEntry && (
          <p className="popup-error">{onlineError}</p>
        )}

        {entry && !showLoading && (
          <>
            <div className="popup-word-title">
              <strong>{displayLemma}</strong>
              {canToggleNetwork && (
                <button
                  type="button"
                  className={`popup-source-toggle${mode === 'online' ? ' active' : ''}`}
                  onClick={() => void toggleNetworkMode()}
                  disabled={onlineLoading}
                >
                  {mode === 'local' ? '网络' : '本地'}
                </button>
              )}
              <span className="popup-source">
                {mode === 'local'
                  ? '来源：ECDICT 本地'
                  : `来源：${getDictionarySourceLabel(entry.source)}`}
              </span>
            </div>

            {compound && compoundTotal > 1 && (
              <p className="popup-compound-hint">
                {compoundIndex === 0
                  ? '连字符词 · 整词'
                  : `连字符词 · 第 ${compoundIndex}/${compound.parts.length} 段`}
              </p>
            )}

            <div className="popup-phonetics">
              {useOnlinePhonetics ? (
                <>
                  {onlineHasUs && (
                    <div className="popup-phonetic-row">
                      <span className="popup-phonetic-label">美</span>
                      <span className="popup-phonetic">
                        {onlineEntry?.phoneticUs ? `/${onlineEntry.phoneticUs}/` : ''}
                      </span>
                      <button
                        type="button"
                        className="popup-audio-btn"
                        aria-label="播放美音"
                        onClick={playUs}
                      >
                        🔊
                      </button>
                    </div>
                  )}
                  {(onlineHasUk || !onlineHasUs) && (
                    <div className="popup-phonetic-row">
                      <span className="popup-phonetic-label">英</span>
                      <span className="popup-phonetic">
                        {onlineEntry?.phoneticUk ? `/${onlineEntry.phoneticUk}/` : ''}
                      </span>
                      <button
                        type="button"
                        className="popup-audio-btn"
                        aria-label="播放英音"
                        onClick={playUk}
                      >
                        🔊
                      </button>
                    </div>
                  )}
                </>
              ) : localPhonetic ? (
                <div className="popup-phonetic-row">
                  <span className="popup-phonetic-label">音标</span>
                  <span className="popup-phonetic">/{localPhonetic}/</span>
                  <button
                    type="button"
                    className="popup-audio-btn"
                    aria-label="播放发音"
                    onClick={() => playSpeechWord(displayLemma, 2)}
                  >
                    🔊
                  </button>
                </div>
              ) : (
                <div className="popup-phonetic-row">
                  <span className="popup-phonetic-label">发音</span>
                  <button
                    type="button"
                    className="popup-audio-btn"
                    aria-label="播放发音"
                    onClick={() => playSpeechWord(displayLemma, 2)}
                  >
                    🔊
                  </button>
                </div>
              )}
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

            {/* 本地：COCA / BNC / 柯林斯 */}
            {mode === 'local' && hasLocalFreq && entry.frequency && (
              <div className="popup-frequency">
                {entry.frequency.frq !== undefined && (
                  <span className="popup-freq-exam">
                    <span className="popup-freq-label">COCA</span>
                    <strong className="popup-freq-num">{entry.frequency.frq}</strong>
                  </span>
                )}
                {entry.frequency.frq !== undefined && entry.frequency.bnc !== undefined && (
                  <span className="popup-freq-sep" aria-hidden>
                    ·
                  </span>
                )}
                {entry.frequency.bnc !== undefined && (
                  <span className="popup-freq-exam">
                    <span className="popup-freq-label">BNC</span>
                    <strong className="popup-freq-num">{entry.frequency.bnc}</strong>
                  </span>
                )}
                {(entry.frequency.frq !== undefined || entry.frequency.bnc !== undefined) &&
                  entry.frequency.collinsStar !== undefined && (
                    <span className="popup-freq-sep" aria-hidden>
                      ·
                    </span>
                  )}
                {entry.frequency.collinsStar !== undefined && (
                  <span
                    className="popup-freq-collins"
                    aria-label={`柯林斯 ${entry.frequency.collinsStar} 星`}
                  >
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
              </div>
            )}

            {/* 联网：柯林斯 + 真题（旧版面板） */}
            {mode === 'online' && hasOnlineFreq && entry.frequency && (
              <div className="popup-frequency">
                {entry.frequency.collinsStar !== undefined && (
                  <span
                    className="popup-freq-collins"
                    aria-label={`柯林斯 ${entry.frequency.collinsStar} 星`}
                  >
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

            {bookOccurrence != null && (
              <div className="popup-book-occurrence" aria-label={`本书出现 ${bookOccurrence} 次`}>
                <span className="popup-freq-label">本书</span>
                <strong className="popup-freq-num">{bookOccurrence}</strong>
                <span className="popup-freq-unit">次</span>
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
                {entry.forms.map((form) => {
                  const canJump =
                    !lookup.exactToken &&
                    form.clickable !== false &&
                    Boolean(extractVariantLookupWord(form.value))
                  const text = form.value ? `${form.label}: ${form.value}` : form.label

                  if (!canJump) {
                    return (
                      <span key={`${form.label}-${form.value}`} className="form-chip form-chip-static">
                        {text}
                      </span>
                    )
                  }

                  return (
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
                      {text}
                    </button>
                  )
                })}
              </div>
            )}

            {/* 词组始终按原型 lemma 绑定，与本地/联网面板无关 */}
            <WordPhraseSection lemma={canonicalLemma || displayLemma} />

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
                <p className="popup-mastered-note">
                  该词将不再显示行间翻译，点词弹窗仍可查看释义与词组。
                </p>
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

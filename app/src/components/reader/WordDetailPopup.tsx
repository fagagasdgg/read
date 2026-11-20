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
import { listRelatedLemmas } from '../../services/words/wordCliques'
import { getWordNote } from '../../services/words/wordNotes'
import { WordEnrichmentEditor } from './WordEnrichmentEditor'
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
  /** modal=阅读弹窗；inline=工具页内嵌 */
  variant?: 'modal' | 'inline'
}

type PanelMode = 'local' | 'online'

export function WordDetailPopup({
  lookup,
  bookId,
  onClose,
  onLookupVariant: _onLookupVariant,
  onCompoundNavigate,
  variant = 'modal',
}: WordDetailPopupProps) {
  void _onLookupVariant
  const isInline = variant === 'inline'
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
  const [activeLookup, setActiveLookup] = useState<WordLookupRequest | null>(lookup)
  const [history, setHistory] = useState<WordLookupRequest[]>(lookup ? [lookup] : [])
  const [lookalikes, setLookalikes] = useState<string[]>([])
  const [synonyms, setSynonyms] = useState<string[]>([])
  const [wordNote, setWordNoteState] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [enrichTick, setEnrichTick] = useState(0)

  useEffect(() => {
    setActiveLookup(lookup)
    setHistory(lookup ? [lookup] : [])
    setEditorOpen(false)
  }, [lookup?.seq])

  useEffect(() => {
    if (!activeLookup) {
      setLocalEntry(null)
      setOnlineEntry(null)
      setCanonicalLemma('')
      setError('')
      setOnlineError('')
      setMastered(false)
      setBookOccurrence(null)
      setMode('local')
      setLookalikes([])
      setSynonyms([])
      setWordNoteState('')
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

    const opts = { exactToken: activeLookup.exactToken }

    ;(async () => {
      try {
        const lemma = await resolveLemma(activeLookup.word, activeLookup.exactToken)
        const local = await lookupLocalWord(activeLookup.word, opts)
        if (cancelled) return

        const markKey = local?.lemma || lemma || normalizeWordToken(activeLookup.word)
        setCanonicalLemma(lemma || normalizeWordToken(activeLookup.word))
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

          setOnlineLoading(true)
          try {
            const online = await lookupOnlineWord(activeLookup.word, opts)
            if (!cancelled) setOnlineEntry(online)
          } catch {
            // 音标失败不影响 ECDICT 释义
          } finally {
            if (!cancelled) setOnlineLoading(false)
          }
          return
        }

        setMode('online')
        setOnlineLoading(true)
        try {
          const online = await lookupOnlineWord(activeLookup.word, opts)
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
  }, [activeLookup, bookId])

  useEffect(() => {
    const key = canonicalLemma
    if (!key) {
      setLookalikes([])
      setSynonyms([])
      setWordNoteState('')
      return
    }
    let cancelled = false
    void Promise.all([
      listRelatedLemmas('lookalike', key),
      listRelatedLemmas('synonym', key),
      getWordNote(key),
    ]).then(([la, sy, note]) => {
      if (cancelled) return
      setLookalikes(la)
      setSynonyms(sy)
      setWordNoteState(note?.text ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [canonicalLemma, enrichTick])

  const entry = mode === 'local' ? localEntry : onlineEntry
  const showLoading = loading || (mode === 'online' && onlineLoading && !onlineEntry)

  async function toggleNetworkMode() {
    if (!activeLookup) return

    if (mode === 'local') {
      setMode('online')
      if (onlineEntry) return

      setOnlineLoading(true)
      setOnlineError('')
      try {
        const online = await lookupOnlineWord(activeLookup.word, {
          exactToken: activeLookup.exactToken,
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

    if (localEntry) {
      setMode('local')
      setOnlineError('')
      return
    }
    setOnlineError('无本地词条可切换')
  }

  function navigateToRelated(word: string) {
    const next: WordLookupRequest = { word, exactToken: true, seq: Date.now() }
    setHistory((prev) => [...prev, next])
    setActiveLookup(next)
  }

  function goHistoryBack() {
    setHistory((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.slice(0, -1)
      setActiveLookup(next[next.length - 1] ?? null)
      return next
    })
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

  if (!activeLookup) return null

  const compound = activeLookup.compound
  const compoundTotal = compound ? compound.parts.length + 1 : 0
  const compoundIndex = compound?.index ?? 0
  const canToggleNetwork = Boolean(localEntry)
  const canGoBack = history.length > 1
  const titleLemma = entry?.lemma || canonicalLemma || normalizeWordToken(activeLookup.word)

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

  const body = (
      <div
        className={`word-popup${isInline ? ' word-popup-inline' : ''}`}
        onClick={isInline ? undefined : (e) => e.stopPropagation()}
      >
        {!isInline ? (
          <button type="button" className="popup-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        ) : null}

        {canGoBack ? (
          <button type="button" className="popup-history-back" onClick={goHistoryBack}>
            ← 返回上一词
          </button>
        ) : null}

        {showLoading && <p className="popup-loading">查询中…</p>}
        {error && !entry && <p className="popup-error">{error}</p>}
        {onlineError && mode === 'online' && !onlineEntry && (
          <p className="popup-error">{onlineError}</p>
        )}

        {!showLoading && titleLemma ? (
          <div className="popup-word-title">
            <button
              type="button"
              className="popup-word-title-btn"
              onClick={() => setEditorOpen(true)}
              title="点击编辑单词信息"
            >
              <strong>{titleLemma}</strong>
            </button>
            {entry && canToggleNetwork ? (
              <button
                type="button"
                className={`popup-source-toggle${mode === 'online' ? ' active' : ''}`}
                onClick={() => void toggleNetworkMode()}
                disabled={onlineLoading}
              >
                {mode === 'local' ? '网络' : '本地'}
              </button>
            ) : null}
            {entry ? (
              <span className="popup-source">
                {mode === 'local'
                  ? '来源：ECDICT 本地'
                  : `来源：${getDictionarySourceLabel(entry.source)}`}
              </span>
            ) : (
              <span className="popup-source">点击单词可补全信息</span>
            )}
          </div>
        ) : null}

        {entry && !showLoading && (
          <>

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
                    !activeLookup.exactToken &&
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
                        if (token) navigateToRelated(token)
                      }}
                    >
                      {text}
                    </button>
                  )
                })}
              </div>
            )}

          </>
        )}

        {!showLoading && titleLemma ? (
          <>
            {lookalikes.length > 0 ? (
              <div className="popup-forms popup-enrich-block">
                <span>形近词：</span>
                {lookalikes.map((item) => (
                  <button
                    key={`la-${item}`}
                    type="button"
                    className="form-chip"
                    onClick={() => navigateToRelated(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}

            {synonyms.length > 0 ? (
              <div className="popup-forms popup-enrich-block">
                <span>义近词：</span>
                {synonyms.map((item) => (
                  <button
                    key={`sy-${item}`}
                    type="button"
                    className="form-chip"
                    onClick={() => navigateToRelated(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}

            {wordNote ? (
              <div className="popup-enrich-block">
                <div className="popup-forms">
                  <span>单词笔记：</span>
                </div>
                <p className="popup-word-note">{wordNote}</p>
              </div>
            ) : null}

            <WordPhraseSection lemma={canonicalLemma || displayLemma || titleLemma} />

            <div className="popup-actions">
              <button
                type="button"
                className={`popup-mastered-btn${mastered ? ' active' : ''}`}
                onClick={() => void toggleMastered()}
                disabled={masteredSaving || !titleLemma}
              >
                {mastered ? '已掌握（点击恢复行间翻译）' : '标记为已掌握'}
              </button>
              {mastered ? (
                <p className="popup-mastered-note">
                  该词将不再显示行间翻译，点词弹窗仍可查看释义与词组。
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {compound && compoundTotal > 1 && !showLoading ? (
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
        ) : null}
      </div>
  )

  return (
    <>
      {isInline ? (
        body
      ) : (
        <div className="popup-mask" onClick={onClose}>
          {body}
        </div>
      )}
      {editorOpen && titleLemma ? (
        <WordEnrichmentEditor
          lemma={titleLemma}
          seedEntry={entry ?? localEntry ?? onlineEntry}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false)
            setEnrichTick((n) => n + 1)
            setActiveLookup((prev) => (prev ? { ...prev, seq: Date.now() } : prev))
          }}
        />
      ) : null}
    </>
  )
}

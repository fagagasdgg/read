import { useEffect, useState } from 'react'
import {
  addManualWordPhrase,
  clearWordPhrases,
  fetchAndSaveWordPhrases,
  getWordPhraseRecord,
  markWordPhrasesFetchedEmpty,
  type WordPhraseRecord,
} from '../../services/words/phrases'

interface WordPhraseSectionProps {
  lemma: string
}

const PHRASE_LIST_COLLAPSED_COUNT = 8

export function WordPhraseSection({ lemma }: WordPhraseSectionProps) {
  const [record, setRecord] = useState<WordPhraseRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [listExpanded, setListExpanded] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [manualPhrase, setManualPhrase] = useState('')
  const [manualTranslation, setManualTranslation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setMessage('')
    setExpanded(false)
    setListExpanded(false)
    setShowAddForm(false)
    setManualPhrase('')
    setManualTranslation('')

    getWordPhraseRecord(lemma)
      .then((next) => {
        if (!cancelled) setRecord(next)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [lemma])

  const hasFetched = Boolean(record?.fetchedAt)
  const phraseCount = record?.items.length ?? 0
  const canCollapseList = phraseCount > PHRASE_LIST_COLLAPSED_COUNT
  const visiblePhrases =
    record && canCollapseList && !listExpanded
      ? record.items.slice(0, PHRASE_LIST_COLLAPSED_COUNT)
      : record?.items ?? []

  async function handleFetch() {
    setFetching(true)
    setError('')
    setMessage('')
    try {
      const next = await fetchAndSaveWordPhrases(lemma)
      setRecord(next)
      setExpanded(true)
      setListExpanded(false)
      setMessage(`已获取 ${next.items.length} 条词组`)
    } catch (err) {
      const text = err instanceof Error ? err.message : '获取词组失败'
      if (text.includes('未找到')) {
        const empty = await markWordPhrasesFetchedEmpty(lemma)
        setRecord(empty)
        setExpanded(true)
        setError(text)
      } else {
        setError(text)
      }
    } finally {
      setFetching(false)
    }
  }

  async function handleAddManual() {
    setError('')
    setMessage('')
    try {
      const next = await addManualWordPhrase(lemma, manualPhrase, manualTranslation)
      setRecord(next)
      setManualPhrase('')
      setManualTranslation('')
      setShowAddForm(false)
      setExpanded(true)
      setMessage('词组已添加')
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败')
    }
  }

  async function handleClear() {
    if (!window.confirm('确定清空该单词的所有词组吗？清空后可重新获取。')) return

    setError('')
    setMessage('')
    await clearWordPhrases(lemma)
    setRecord(null)
    setExpanded(false)
    setListExpanded(false)
    setShowAddForm(false)
    setMessage('词组已清空')
  }

  if (loading) return null

  return (
    <div className="popup-phrase-section">
      {!hasFetched ? (
        <button
          type="button"
          className="popup-phrase-fetch-btn"
          onClick={() => void handleFetch()}
          disabled={fetching}
        >
          {fetching ? '获取词组中…' : '获取词组'}
        </button>
      ) : (
        <div className="popup-phrase-panel">
          <button
            type="button"
            className={`popup-phrase-summary${expanded ? ' expanded' : ''}`}
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            <span>词组</span>
            <span className="popup-phrase-summary-meta">
              {phraseCount > 0 ? `${phraseCount} 条` : '暂无'}
              <em aria-hidden>{expanded ? '▾' : '▸'}</em>
            </span>
          </button>

          {expanded && (
            <div className="popup-phrase-body">
              {phraseCount > 0 ? (
                <>
                  <ul className="popup-phrase-list">
                    {visiblePhrases.map((item) => (
                      <li key={item.id} className="popup-phrase-line">
                        <span className="popup-phrase-text">{item.phrase}</span>
                        <span className="popup-phrase-sep">·</span>
                        <span className="popup-phrase-meaning">{item.translation}</span>
                      </li>
                    ))}
                  </ul>
                  {canCollapseList && (
                    <p className="popup-phrase-list-hint">
                      {listExpanded
                        ? `已展示全部 ${phraseCount} 条词组`
                        : `已展示前 ${PHRASE_LIST_COLLAPSED_COUNT} 条，共 ${phraseCount} 条`}
                    </p>
                  )}
                </>
              ) : (
                <p className="popup-phrase-empty">暂无词组，可点击下方补充。</p>
              )}

              {showAddForm ? (
                <div className="popup-phrase-form">
                  <input
                    type="text"
                    className="popup-phrase-input"
                    placeholder="词组，如 look at"
                    value={manualPhrase}
                    onChange={(e) => setManualPhrase(e.target.value)}
                  />
                  <input
                    type="text"
                    className="popup-phrase-input"
                    placeholder="释义，如 看"
                    value={manualTranslation}
                    onChange={(e) => setManualTranslation(e.target.value)}
                  />
                  <div className="popup-phrase-form-actions">
                    <button type="button" className="popup-phrase-link-btn" onClick={() => void handleAddManual()}>
                      保存
                    </button>
                    <button
                      type="button"
                      className="popup-phrase-link-btn muted"
                      onClick={() => {
                        setShowAddForm(false)
                        setManualPhrase('')
                        setManualTranslation('')
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="popup-phrase-tools">
                  <button
                    type="button"
                    className="popup-phrase-link-btn"
                    onClick={() => setShowAddForm(true)}
                  >
                    补充词组
                  </button>
                  {canCollapseList && (
                    <>
                      <span className="popup-phrase-tool-sep">|</span>
                      <button
                        type="button"
                        className="popup-phrase-link-btn"
                        onClick={() => setListExpanded((value) => !value)}
                      >
                        {listExpanded ? '收起词组' : `展开全部（${phraseCount}）`}
                      </button>
                    </>
                  )}
                  <span className="popup-phrase-tool-sep">|</span>
                  <button
                    type="button"
                    className="popup-phrase-link-btn danger"
                    onClick={() => void handleClear()}
                  >
                    清空词组
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {message && <p className="popup-phrase-message">{message}</p>}
      {error && <p className="popup-phrase-error">{error}</p>}
    </div>
  )
}

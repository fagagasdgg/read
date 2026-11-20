import { useEffect, useRef, useState } from 'react'
import { CollapsibleSettingsSection } from '../settings/CollapsibleSettingsSection'
import { WordDetailPopup, type WordLookupRequest } from '../reader/WordDetailPopup'
import { suggestWords, type WordSuggestItem } from '../../services/dictionary/wordSuggest'
import { loadUserSettings } from '../../services/settings/userSettings'

export function WordLookupTool() {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<WordSuggestItem[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [lookup, setLookup] = useState<WordLookupRequest | null>(null)
  const [error, setError] = useState('')
  const seqRef = useRef(0)

  useEffect(() => {
    const q = input.trim()
    if (!q) {
      setSuggestions([])
      setSuggestLoading(false)
      return
    }

    const seq = ++seqRef.current
    setSuggestLoading(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const settings = await loadUserSettings()
          const items = await suggestWords(q, {
            mode: settings.wordSuggestMatchMode,
            limit: settings.wordSuggestLimit,
          })
          if (seq !== seqRef.current) return
          setSuggestions(items)
          setError('')
        } catch (err) {
          if (seq !== seqRef.current) return
          setSuggestions([])
          setError(err instanceof Error ? err.message : '联想失败')
        } finally {
          if (seq === seqRef.current) setSuggestLoading(false)
        }
      })()
    }, 220)

    return () => window.clearTimeout(timer)
  }, [input])

  function openWord(word: string) {
    setInput(word)
    setSuggestions([])
    setLookup({ word, exactToken: false, seq: Date.now() })
  }

  return (
    <CollapsibleSettingsSection
      title="单词查询"
      summary="输入联想；详情内嵌展示；可编辑形近/义近/笔记"
      defaultExpanded={false}
    >
      <p className="settings-section-note">
        支持英文模糊与中文释义检索（条数与匹配方式可在「设置」调整）。点选结果后在下方查看详情。
      </p>

      <div className="word-lookup-tool">
        <div className="word-lookup-tool-row">
          <input
            className="word-lookup-tool-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入英文或中文释义…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && suggestions[0]) {
                e.preventDefault()
                openWord(suggestions[0].lemma)
              }
            }}
          />
          {input ? (
            <button
              type="button"
              className="tools-secondary-btn"
              onClick={() => {
                setInput('')
                setSuggestions([])
                setLookup(null)
              }}
            >
              清空
            </button>
          ) : null}
        </div>

        {suggestLoading ? <p className="settings-section-note">联想中…</p> : null}
        {error ? <p className="tools-error">{error}</p> : null}

        {suggestions.length > 0 ? (
          <ul className="word-suggest-list">
            {suggestions.map((item) => (
              <li key={`${item.source}:${item.lemma}`}>
                <button type="button" className="word-suggest-item" onClick={() => openWord(item.lemma)}>
                  <strong>{item.lemma}</strong>
                  {item.gloss ? <span>{item.gloss}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {lookup ? (
          <div className="word-lookup-inline-panel">
            <div className="word-lookup-inline-head">
              <h4>单词详情</h4>
              <button type="button" className="word-enrich-link-btn" onClick={() => setLookup(null)}>
                收起
              </button>
            </div>
            <WordDetailPopup
              lookup={lookup}
              variant="inline"
              onClose={() => setLookup(null)}
            />
          </div>
        ) : null}
      </div>
    </CollapsibleSettingsSection>
  )
}

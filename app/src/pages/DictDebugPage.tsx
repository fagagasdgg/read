import { useState } from 'react'
import { lookupWord } from '../services/dictionary'
import type { WordEntry } from '../services/dictionary'

export function DictDebugPage() {
  const [query, setQuery] = useState('pick')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [entry, setEntry] = useState<WordEntry | null>(null)
  const [fromCache, setFromCache] = useState(false)

  async function handleLookup(word = query, forceRefresh = false) {
    setQuery(word)
    setLoading(true)
    setError('')
    try {
      const before = performance.now()
      const result = await lookupWord(word, { forceRefresh })
      const elapsed = Math.round(performance.now() - before)
      setEntry(result)
      setFromCache(!forceRefresh && elapsed < 80)
      if (!result) setError('未找到该词的释义')
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败')
      setEntry(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card">
      <h2>词典联调（有道免费接口 + 本地缓存）</h2>
      <div className="lookup-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入英文单词，如 pick / told"
        />
        <button type="button" onClick={() => void handleLookup()} disabled={loading}>
          {loading ? '查询中…' : '查询'}
        </button>
        <button type="button" onClick={() => void handleLookup(query, true)} disabled={loading}>
          强制联网
        </button>
      </div>
      {fromCache && <p className="hint">本次结果来自本地缓存</p>}
      {error && <p className="error">{error}</p>}

      {entry && (
        <article className="word-card">
          <div className="word-title">
            <strong>{entry.lemma}</strong>
            <span>/{entry.phoneticUs || entry.phoneticUk}/</span>
            <a href={entry.usSpeechUrl} target="_blank" rel="noreferrer">
              美音
            </a>
          </div>
          {entry.examLevels.length > 0 && (
            <p className="levels">等级: {entry.examLevels.join(' / ')}</p>
          )}
          <ul className="defs">
            {entry.definitions.map((def, index) => (
              <li key={`${def.pos}-${index}`}>
                {def.pos && <span className="pos">{def.pos}</span>}
                {def.translation}
              </li>
            ))}
          </ul>
          {entry.forms.length > 0 && (
            <div className="forms">
              <span>变体：</span>
              {entry.forms.map((form) => (
                <button
                  key={`${form.label}-${form.value}`}
                  type="button"
                  className="form-chip"
                  onClick={() => void handleLookup(form.value)}
                >
                  {form.label}: {form.value}
                </button>
              ))}
            </div>
          )}
        </article>
      )}
    </section>
  )
}

import { useState } from 'react'
import { CollapsibleSettingsSection } from '../settings/CollapsibleSettingsSection'
import { WordDetailPopup, type WordLookupRequest } from '../reader/WordDetailPopup'

export function WordLookupTool() {
  const [input, setInput] = useState('')
  const [lookup, setLookup] = useState<WordLookupRequest | null>(null)
  const [error, setError] = useState('')

  function handleSearch() {
    setError('')
    const word = input.trim()
    if (!word) {
      setError('请输入要查询的单词')
      return
    }
    setLookup({ word, exactToken: false, seq: Date.now() })
  }

  return (
    <CollapsibleSettingsSection
      title="单词查询"
      summary="查询单词详情，并编辑音标/释义/形近词/义近词/笔记"
      defaultExpanded={false}
    >
      <p className="settings-section-note">
        与阅读点词同一套详情页：点击左上角单词可编辑；支持形近词、义近词与单词笔记。
      </p>
      <div className="word-lookup-tool-row">
        <input
          className="word-lookup-tool-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入英文单词"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSearch()
            }
          }}
        />
        <button type="button" className="tools-primary-btn" onClick={handleSearch}>
          查询
        </button>
      </div>
      {error ? <p className="tools-error">{error}</p> : null}

      <WordDetailPopup lookup={lookup} onClose={() => setLookup(null)} />
    </CollapsibleSettingsSection>
  )
}

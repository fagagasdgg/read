import { useCallback, useEffect, useState } from 'react'
import {
  DICTIONARY_SOURCES,
  formatSourceCheckTime,
  getDictionarySourceStatus,
  probeDictionarySources,
  subscribeDictionarySourceStatus,
  type SourceStatusView,
} from '../../services/dictionary'

function mergeSourceViews(staticSources: typeof DICTIONARY_SOURCES, dynamic: SourceStatusView[]) {
  const map = new Map(dynamic.map((item) => [item.id, item]))
  return staticSources.map((source) => {
    const status = map.get(source.id)
    if (status) return { ...source, status }
    return {
      ...source,
      status: {
        id: source.id,
        label: source.label,
        role: source.role,
        health: 'unknown' as const,
        healthLabel: '未检测',
        totalChecks: 0,
        hitCount: 0,
        missCount: 0,
        errorCount: 0,
        successRate: null,
        lastCheckAt: null,
        lastErrorMessage: '',
      },
    }
  })
}

export function DictionarySourcesSection() {
  const [sourceViews, setSourceViews] = useState<SourceStatusView[]>([])
  const [probing, setProbing] = useState(false)

  const refreshSources = useCallback(async () => {
    const sources = await getDictionarySourceStatus()
    setSourceViews(sources)
  }, [])

  useEffect(() => {
    void refreshSources()
    const unsub = subscribeDictionarySourceStatus(() => {
      void refreshSources()
    })
    return unsub
  }, [refreshSources])

  const sourcesWithStatus = mergeSourceViews(DICTIONARY_SOURCES, sourceViews)

  async function handleProbeSources() {
    setProbing(true)
    try {
      const next = await probeDictionarySources()
      setSourceViews(next)
    } finally {
      setProbing(false)
    }
  }

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h4 className="settings-section-title">查词信源</h4>
        <button
          type="button"
          className="reader-dict-probe-btn"
          onClick={() => void handleProbeSources()}
          disabled={probing}
        >
          {probing ? '检测中…' : '检测信源'}
        </button>
      </div>
      <ul className="reader-dict-sources">
        {sourcesWithStatus.map(({ id, label, role, description, status }) => (
          <li key={id} className="reader-dict-source-item">
            <div className="reader-dict-source-top">
              <span className="reader-dict-source-name">
                {label}
                <em className={`reader-dict-source-role reader-dict-source-role-${role}`}>
                  {role === 'primary' ? '主' : '备'}
                </em>
              </span>
              <span className={`reader-dict-health reader-dict-health-${status.health}`}>
                {status.healthLabel}
              </span>
            </div>
            <span className="reader-dict-source-desc">{description}</span>
            <span className="reader-dict-source-metrics">
              {status.totalChecks > 0 ? (
                <>
                  可用率 <strong>{status.successRate ?? 0}%</strong>
                  <span className="reader-dict-metric-sep">·</span>
                  命中 {status.hitCount}
                  <span className="reader-dict-metric-sep">·</span>
                  失败 {status.errorCount}
                </>
              ) : (
                '尚无查词记录，可点「检测信源」'
              )}
            </span>
            <span className="reader-dict-source-time">
              最近检测：{formatSourceCheckTime(status.lastCheckAt)}
            </span>
            {status.lastErrorMessage && status.health !== 'healthy' && (
              <span className="reader-dict-source-error">{status.lastErrorMessage}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="settings-section-note">
        阅读时自动累计各信源状态；有道未命中时自动尝试金山词霸。
      </p>
    </section>
  )
}

import { Clipboard } from '@capacitor/clipboard'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  discoverZLibraryMirrors,
  loadZLibraryMirrorConfig,
  openMirrorUrl,
  probeZLibraryMirrors,
  sortProbeResults,
  type ZLibraryConfigLoadResult,
  type ZLibraryMirrorCandidate,
  type ZLibraryProbeResult,
  type ZLibraryProbeSettings,
} from '../../services/tools/zlibraryMirrors'

function statusLabel(result: ZLibraryProbeResult): string {
  if (result.status === 'checking') return '检测中…'
  if (result.status === 'reachable') {
    const latency = result.latencyMs != null ? ` · ${result.latencyMs}ms` : ''
    const method = result.method ? ` · ${result.method}` : ''
    return `可访问${latency}${method}`
  }
  if (result.status === 'unreachable') return result.error ?? '不可访问'
  return '待检测'
}

function ZLibraryHelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="tools-help-overlay" onMouseDown={onClose}>
      <div
        className="tools-help-panel"
        role="dialog"
        aria-labelledby="tools-help-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="tools-help-panel-header">
          <h4 id="tools-help-title">Z-Library 镜像检测 · 使用说明</h4>
          <button type="button" className="tools-help-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="tools-help-panel-body">
          <section>
            <h5>这个工具做什么？</h5>
            <p>
              在你手机<strong>当前网络</strong>下，逐个测试 Z-Library 相关网址能否打开。只检测连通性，不提供下载或登录功能。
            </p>
          </section>

          <section>
            <h5>一键检测可用入口</h5>
            <ol>
              <li>先检测应用<strong>内置</strong>的约 10 个候选网址（无需联网访问 GitHub）。</li>
              <li>若内置全部不可用，会<strong>自动</strong>扩大搜索并继续检测新找到的地址。</li>
              <li>检测完成后，可访问的条目会排在前面，可点「打开」或「复制」。</li>
            </ol>
          </section>

          <section>
            <h5>仅扩大搜索</h5>
            <p>
              跳过内置列表，直接尝试：组合常见域名变体、解析已知入口页、通过搜索引擎检索更多地址，再逐个验证。
              适合内置已知失效、想单独尝试「全网找新入口」时使用。
            </p>
            <p className="tools-help-note">
              扩大搜索依赖本机能否访问 DuckDuckGo、Bing 等检索服务；部分网络环境下可能搜不到新地址。
            </p>
          </section>

          <section>
            <h5>刷新远程列表（可选）</h5>
            <p>
              <strong>默认不需要点这个。</strong>应用已自带内置候选列表，打开工具即可用「一键检测」。
            </p>
            <p>
              此按钮会尝试从 GitHub 拉取仓库里的 <code>zlibrary-mirrors.json</code>，用于更新候选网址、超时与并发等参数。
              只有在你能访问 GitHub 时才有用；拉取失败会继续使用内置列表，不影响检测。
            </p>
            <p className="tools-help-note">
              简单说：<strong>日常用内置列表即可</strong>；GitHub JSON 只是可选的维护渠道，方便以后发版或远程更新镜像表，不是必选项。
            </p>
          </section>

          <section>
            <h5>结果标签含义</h5>
            <ul>
              <li><strong>组合</strong>：由常见域名前缀与后缀自动拼出的变体</li>
              <li><strong>页面</strong>：从 SingleLogin、Z-Access 等入口页解析出的链接</li>
              <li><strong>检索</strong>：搜索引擎返回的相关网址</li>
            </ul>
          </section>

          <section>
            <h5>合规提示</h5>
            <p>请遵守当地法律法规与版权规定。下方「备用获取方式」为官方渠道参考，与本工具检测无关。</p>
          </section>
        </div>
      </div>
    </div>
  )
}

export function ZLibraryFinderTool() {
  const [expanded, setExpanded] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [mirrors, setMirrors] = useState<ZLibraryMirrorCandidate[]>([])
  const [tips, setTips] = useState<string[]>([])
  const [probeSettings, setProbeSettings] = useState<ZLibraryProbeSettings | null>(null)
  const [configMeta, setConfigMeta] = useState<Pick<
    ZLibraryConfigLoadResult,
    'source' | 'sourceLabel' | 'fetchedAt' | 'config'
  > | null>(null)
  const [results, setResults] = useState<ZLibraryProbeResult[]>([])
  const [probing, setProbing] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [message, setMessage] = useState('')
  const probeTokenRef = useRef(0)

  const applyConfig = useCallback((loaded: ZLibraryConfigLoadResult) => {
    setMirrors(loaded.config.mirrors)
    setTips(loaded.config.tips)
    setProbeSettings(loaded.probe)
    setConfigMeta({
      source: loaded.source,
      sourceLabel: loaded.sourceLabel,
      fetchedAt: loaded.fetchedAt,
      config: loaded.config,
    })
    setResults(
      loaded.config.mirrors.map((mirror) => ({
        mirror,
        status: 'idle',
      })),
    )
  }, [])

  const loadConfig = useCallback(
    async (forceRemote = false) => {
      setLoadingConfig(true)
      try {
        const loaded = await loadZLibraryMirrorConfig({ forceRemote })
        applyConfig(loaded)
        setMessage(
          forceRemote
            ? `已刷新候选列表（${loaded.sourceLabel}）`
            : `已加载候选列表（${loaded.sourceLabel}）`,
        )
      } catch (err) {
        setMessage(err instanceof Error ? err.message : '加载配置失败')
      } finally {
        setLoadingConfig(false)
      }
    },
    [applyConfig],
  )

  useEffect(() => {
    void loadConfig(false)
  }, [loadConfig])

  const runDiscoveryAndProbe = useCallback(
    async (
      token: number,
      excludeUrls: string[],
      baseResults: ZLibraryProbeResult[],
      progressPrefix: string,
    ): Promise<{ allResults: ZLibraryProbeResult[]; reachable: number; discoverySummary: string[] }> => {
      setMessage(`${progressPrefix}正在扩大搜索（域名组合 + 页面解析 + 网络检索）…`)

      const discovery = await discoverZLibraryMirrors(excludeUrls, (progress) => {
        if (probeTokenRef.current !== token) return
        setMessage(progress.message)
      })

      if (probeTokenRef.current !== token) {
        return { allResults: baseResults, reachable: 0, discoverySummary: discovery.summary }
      }

      if (discovery.candidates.length === 0) {
        return { allResults: baseResults, reachable: 0, discoverySummary: discovery.summary }
      }

      const discoveryPlaceholders: ZLibraryProbeResult[] = discovery.candidates.map((mirror) => ({
        mirror,
        status: 'checking',
      }))
      setResults([...baseResults, ...discoveryPlaceholders])

      const discoveredResults = await probeZLibraryMirrors(
        discovery.candidates,
        probeSettings!,
        (result, index) => {
          if (probeTokenRef.current !== token) return
          setResults((prev) => {
            const copy = [...prev]
            const offset = baseResults.length
            copy[offset + index] = result
            return copy
          })
        },
      )

      const allResults = [...baseResults, ...discoveredResults]
      const reachable = allResults.filter((item) => item.status === 'reachable').length
      return { allResults, reachable, discoverySummary: discovery.summary }
    },
    [probeSettings],
  )

  async function handleProbe() {
    if (!mirrors.length || probing || !probeSettings) return

    const token = probeTokenRef.current + 1
    probeTokenRef.current = token

    setProbing(true)
    setMessage('正在检测内置候选入口…')
    setResults(mirrors.map((mirror) => ({ mirror, status: 'checking' })))

    try {
      let allResults = await probeZLibraryMirrors(mirrors, probeSettings, (result, index) => {
        if (probeTokenRef.current !== token) return
        setResults((prev) => {
          const copy = [...prev]
          copy[index] = result
          return copy
        })
      })

      if (probeTokenRef.current !== token) return

      let reachable = allResults.filter((item) => item.status === 'reachable').length

      if (reachable === 0) {
        const excludeUrls = allResults.map((item) => item.mirror.url)
        const discoveryOutcome = await runDiscoveryAndProbe(token, excludeUrls, allResults, '内置入口均不可用，')

        if (probeTokenRef.current !== token) return

        allResults = discoveryOutcome.allResults
        reachable = discoveryOutcome.reachable

        if (discoveryOutcome.discoverySummary.length && allResults.length > mirrors.length) {
          const sorted = sortProbeResults(allResults)
          setResults(sorted)
          setMessage(
            reachable > 0
              ? `扩大搜索后找到 ${reachable} 个可访问入口（${discoveryOutcome.discoverySummary.join('；')}）`
              : `扩大搜索完成，仍未发现可访问入口（${discoveryOutcome.discoverySummary.join('；')}）`,
          )
        } else {
          const sorted = sortProbeResults(allResults)
          setResults(sorted)
          setMessage('内置入口不可用，且未能检索到新的候选地址，请稍后再试或查看下方备用方式')
        }
      } else {
        const sorted = sortProbeResults(allResults)
        setResults(sorted)
        setMessage(`检测完成：${reachable} 个内置入口可访问（按速度与可用性排序）`)
      }
    } catch (err) {
      if (probeTokenRef.current !== token) return
      setMessage(err instanceof Error ? err.message : '检测失败')
    } finally {
      if (probeTokenRef.current === token) {
        setProbing(false)
      }
    }
  }

  async function handleExpandSearchOnly() {
    if (!mirrors.length || probing || !probeSettings) return

    const token = probeTokenRef.current + 1
    probeTokenRef.current = token

    setProbing(true)
    const baseResults = mirrors.map((mirror) => ({ mirror, status: 'idle' as const }))
    setResults(baseResults)
    setMessage('正在仅扩大搜索，跳过内置检测…')

    try {
      const excludeUrls = mirrors.map((mirror) => mirror.url)
      const discoveryOutcome = await runDiscoveryAndProbe(token, excludeUrls, baseResults, '')

      if (probeTokenRef.current !== token) return

      if (discoveryOutcome.allResults.length <= mirrors.length) {
        setMessage(
          discoveryOutcome.discoverySummary.length
            ? `未能检索到新的候选地址（${discoveryOutcome.discoverySummary.join('；')}）`
            : '未能检索到新的候选地址，请稍后再试或查看下方备用方式',
        )
      } else {
        const sorted = sortProbeResults(discoveryOutcome.allResults)
        setResults(sorted)
        setMessage(
          discoveryOutcome.reachable > 0
            ? `扩大搜索找到 ${discoveryOutcome.reachable} 个可访问入口（${discoveryOutcome.discoverySummary.join('；')}）`
            : `扩大搜索完成，新地址均不可访问（${discoveryOutcome.discoverySummary.join('；')}）`,
        )
      }
    } catch (err) {
      if (probeTokenRef.current !== token) return
      setMessage(err instanceof Error ? err.message : '扩大搜索失败')
    } finally {
      if (probeTokenRef.current === token) {
        setProbing(false)
      }
    }
  }

  async function handleCopy(url: string) {
    try {
      await Clipboard.write({ string: url })
      setMessage('链接已复制到剪贴板')
    } catch {
      setMessage('复制失败，请手动长按复制')
    }
  }

  const displayResults = results.length
    ? results
    : mirrors.map((mirror) => ({ mirror, status: 'idle' as const }))

  const busy = probing || loadingConfig

  return (
    <>
      <section className={`tools-card tools-card-collapsible${expanded ? ' expanded' : ''}`}>
        <div className="tools-card-toggle-row">
          <button
            type="button"
            className="tools-card-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <div className="tools-card-toggle-text">
              <h3>Z-Library 镜像检测</h3>
              {!expanded && (
                <p className="tools-card-summary">检测本机网络下可用入口；内置失效时可扩大搜索</p>
              )}
            </div>
            <span className="tools-card-chevron" aria-hidden>
              {expanded ? '▾' : '▸'}
            </span>
          </button>
          <button
            type="button"
            className="tools-help-btn"
            aria-label="使用说明"
            title="使用说明"
            onClick={() => setHelpOpen(true)}
          >
            ?
          </button>
        </div>

        {expanded && (
          <div className="tools-card-body">
            <p className="tools-card-desc">
              先检测内置候选网址；若均不可用，一键检测会自动扩大搜索。也可单独使用「仅扩大搜索」跳过内置列表。
            </p>

            <div className="tools-card-actions">
              <button
                type="button"
                className="tools-primary-btn"
                disabled={busy || mirrors.length === 0 || !probeSettings}
                onClick={() => void handleProbe()}
              >
                {probing ? '检测中…' : '一键检测'}
              </button>
              <button
                type="button"
                className="tools-secondary-btn"
                disabled={busy || mirrors.length === 0 || !probeSettings}
                onClick={() => void handleExpandSearchOnly()}
              >
                仅扩大搜索
              </button>
              <button
                type="button"
                className="tools-secondary-btn tools-secondary-btn-compact"
                disabled={busy}
                onClick={() => void loadConfig(true)}
              >
                {loadingConfig ? '刷新中…' : '刷新远程列表'}
              </button>
            </div>

            {configMeta && (
              <p className="tools-meta">
                配置来源：{configMeta.sourceLabel}
                {configMeta.config.updatedAt ? ` · 版本 ${configMeta.config.updatedAt}` : ''}
                {probeSettings
                  ? ` · 超时 ${probeSettings.timeoutMs}ms · 并发 ${probeSettings.concurrency}`
                  : ''}
              </p>
            )}
            {message && <p className="tools-message">{message}</p>}

            <ul className="tools-mirror-list">
              {displayResults.map((result) => {
                const openUrl =
                  ('finalUrl' in result && result.finalUrl) || result.mirror.url
                return (
                  <li
                    key={`${result.mirror.url}-${result.mirror.label}`}
                    className={`tools-mirror-item tools-mirror-item-${result.status}`}
                  >
                    <div className="tools-mirror-main">
                      <strong>{result.mirror.label}</strong>
                      <span className="tools-mirror-url">{openUrl}</span>
                      <span className="tools-mirror-status">{statusLabel(result)}</span>
                    </div>
                    <div className="tools-mirror-actions">
                      <button
                        type="button"
                        className="tools-inline-btn"
                        disabled={result.status !== 'reachable'}
                        onClick={() => openMirrorUrl(openUrl)}
                      >
                        打开
                      </button>
                      <button
                        type="button"
                        className="tools-inline-btn"
                        onClick={() => void handleCopy(openUrl)}
                      >
                        复制
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="tools-tips">
              <h4>备用获取方式</h4>
              <ul>
                {tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
              <p className="tools-disclaimer">
                请遵守当地法律法规与版权规定。点标题旁 ? 可查看完整使用说明。
              </p>
            </div>
          </div>
        )}
      </section>

      {helpOpen && <ZLibraryHelpPanel onClose={() => setHelpOpen(false)} />}
    </>
  )
}

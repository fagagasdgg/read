import { useEffect, useState } from 'react'
import {
  getLlmProviderLabel,
  loadLlmProviderSettings,
  saveLlmProvider,
  type LlmProvider,
} from '../../services/llm/llmProvider'
import { DoubaoApiSection } from './DoubaoApiSection'
import { ZhipuApiSection } from './ZhipuApiSection'

export function DeepAnalysisSettings({ embedded = false }: { embedded?: boolean }) {
  const [provider, setProvider] = useState<LlmProvider>('zhipu')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadLlmProviderSettings().then((loaded) => setProvider(loaded.provider))
  }, [])

  async function handleProviderChange(next: LlmProvider) {
    setProvider(next)
    await saveLlmProvider(next)
    setMessage(`已切换为 ${getLlmProviderLabel(next)}`)
    setTimeout(() => setMessage(''), 1500)
  }

  const body = (
    <>
      <p className="settings-section-note">
        选段「深度解析」使用下方配置的 AI 服务。智谱与豆包二选一，豆包半自动导入流程不受影响。
      </p>

      <div className="llm-provider-switch" role="radiogroup" aria-label="AI 服务商">
        {(['zhipu', 'doubao'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={provider === item}
            className={`llm-provider-chip${provider === item ? ' active' : ''}`}
            onClick={() => void handleProviderChange(item)}
          >
            {getLlmProviderLabel(item)}
          </button>
        ))}
      </div>

      {message && <p className="reader-backup-dir-message">{message}</p>}

      <div className="settings-section-divider settings-section-divider-inner" />

      {provider === 'zhipu' ? <ZhipuApiSection embedded /> : <DoubaoApiSection embedded />}
    </>
  )

  if (embedded) return body

  return (
    <section className="settings-section">
      <h4 className="settings-section-title">深度解析（AI）</h4>
      {body}
    </section>
  )
}

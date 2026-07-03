import { useEffect, useState } from 'react'
import { probeZhipuApiKey } from '../../services/llm/zhipuClient'
import {
  loadZhipuSettings,
  maskApiKey,
  saveZhipuSettings,
  ZHIPU_DEFAULT_MODEL,
  ZHIPU_FREE_MODELS,
  type ZhipuSettings,
} from '../../services/llm/zhipuSettings'

export function ZhipuApiSection() {
  const [settings, setSettings] = useState<ZhipuSettings | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [modelId, setModelId] = useState(ZHIPU_DEFAULT_MODEL)
  const [saving, setSaving] = useState(false)
  const [probing, setProbing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void loadZhipuSettings().then((loaded) => {
      setSettings(loaded)
      setApiKeyInput(loaded.apiKey)
      setModelId(loaded.model)
    })
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const next = await saveZhipuSettings({ apiKey: apiKeyInput, model: modelId })
      setSettings(next)
      setModelId(next.model)
      setMessage('已保存')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleProbe() {
    setProbing(true)
    setError('')
    setMessage('')
    try {
      const key = apiKeyInput.trim()
      if (!key) throw new Error('请先填写 API Key')
      await probeZhipuApiKey(key, modelId)
      setMessage('连接成功，Key 与模型可用')
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败')
    } finally {
      setProbing(false)
    }
  }

  const selectedModel = ZHIPU_FREE_MODELS.find((item) => item.id === modelId)

  return (
    <section className="settings-section">
      <h4 className="settings-section-title">深度解析（智谱 AI）</h4>
      <p className="settings-section-note">
        选段「深度解析」使用智谱免费 Flash 模型。请在{' '}
        <a href="https://open.bigmodel.cn/usercenter/apikeys" target="_blank" rel="noreferrer">
          open.bigmodel.cn
        </a>{' '}
        创建 API Key 并粘贴到下方。Key 仅保存在本机。
      </p>

      <label className="reader-setting-row zhipu-key-row">
        <span>API Key</span>
        <input
          className="zhipu-key-input"
          type="password"
          autoComplete="off"
          placeholder="粘贴智谱 API Key"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
        />
      </label>

      <label className="reader-setting-row">
        <span>模型</span>
        <select
          className="reader-level-select"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
        >
          {ZHIPU_FREE_MODELS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {selectedModel?.hint && (
        <p className="settings-section-note">{selectedModel.hint}</p>
      )}

      {settings?.apiKey ? (
        <p className="settings-section-note">
          已保存 Key：<strong>{maskApiKey(settings.apiKey)}</strong>
        </p>
      ) : null}

      <div className="zhipu-key-actions">
        <button type="button" className="reader-backup-dir-btn" onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          className="reader-dict-probe-btn"
          onClick={() => void handleProbe()}
          disabled={probing}
        >
          {probing ? '检测中…' : '检测连接'}
        </button>
      </div>

      {message && <p className="reader-backup-dir-message">{message}</p>}
      {error && <p className="zhipu-key-error">{error}</p>}
    </section>
  )
}

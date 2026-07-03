import { useEffect, useState } from 'react'
import { probeZhipuApiKey } from '../../services/llm/zhipuClient'
import {
  addCustomZhipuModel,
  getAllZhipuModels,
  getZhipuModelOption,
  isCustomZhipuModel,
  loadZhipuSettings,
  maskApiKey,
  removeCustomZhipuModel,
  saveZhipuSettings,
  ZHIPU_DEFAULT_MODEL,
  type ZhipuSettings,
} from '../../services/llm/zhipuSettings'

function formatTokenCount(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}K tokens`
  return `${value} tokens`
}

export function ZhipuApiSection() {
  const [settings, setSettings] = useState<ZhipuSettings | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [modelId, setModelId] = useState(ZHIPU_DEFAULT_MODEL)
  const [newModelId, setNewModelId] = useState('')
  const [newModelLabel, setNewModelLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingModel, setAddingModel] = useState(false)
  const [removingModel, setRemovingModel] = useState(false)
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

  const customModels = settings?.customModels ?? []
  const allModels = getAllZhipuModels(customModels)
  const selectedModel = getZhipuModelOption(modelId, customModels)
  const selectedIsCustom = settings ? isCustomZhipuModel(modelId, customModels) : false

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
      await probeZhipuApiKey(key, modelId, customModels)
      setMessage('连接成功，Key 与模型可用')
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败')
    } finally {
      setProbing(false)
    }
  }

  async function handleAddModel() {
    setAddingModel(true)
    setError('')
    setMessage('')
    try {
      const next = await addCustomZhipuModel(newModelId, newModelLabel)
      setSettings(next)
      setModelId(next.model)
      setNewModelId('')
      setNewModelLabel('')
      setMessage(`已添加模型 ${next.model}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败')
    } finally {
      setAddingModel(false)
    }
  }

  async function handleRemoveModel() {
    if (!selectedIsCustom) return
    setRemovingModel(true)
    setError('')
    setMessage('')
    try {
      const next = await removeCustomZhipuModel(modelId)
      setSettings(next)
      setModelId(next.model)
      setMessage('已删除自定义模型')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setRemovingModel(false)
    }
  }

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
          {allModels.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.verified ? ' ✓' : ''}
              {isCustomZhipuModel(item.id, customModels) ? ' ·自定义' : ''}
            </option>
          ))}
        </select>
      </label>

      {selectedModel && (
        <div className="zhipu-model-specs">
          <p>
            单次输出上限：<strong>{selectedModel.maxOutputTokens} tokens</strong>
          </p>
          <p>
            上下文窗口：约 <strong>{formatTokenCount(selectedModel.contextTokens)}</strong>
          </p>
          <p>
            建议选段：不超过 <strong>{selectedModel.suggestMaxWords} 个英文词</strong>
          </p>
          {selectedModel.hint && <p className="settings-section-note">{selectedModel.hint}</p>}
        </div>
      )}

      <div className="zhipu-custom-model-block">
        <p className="settings-section-note">自定义模型 ID（如官方新发布的 glm-xxx）</p>
        <label className="reader-setting-row zhipu-key-row">
          <span>模型 ID</span>
          <input
            className="zhipu-key-input"
            type="text"
            autoComplete="off"
            placeholder="例如 glm-4-flash-250414"
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
          />
        </label>
        <label className="reader-setting-row zhipu-key-row">
          <span>显示名</span>
          <input
            className="zhipu-key-input"
            type="text"
            autoComplete="off"
            placeholder="可选，默认同 ID"
            value={newModelLabel}
            onChange={(e) => setNewModelLabel(e.target.value)}
          />
        </label>
        <div className="zhipu-key-actions">
          <button
            type="button"
            className="reader-backup-dir-btn"
            onClick={() => void handleAddModel()}
            disabled={addingModel || !newModelId.trim()}
          >
            {addingModel ? '添加中…' : '添加模型'}
          </button>
          {selectedIsCustom && (
            <button
              type="button"
              className="reader-dict-probe-btn zhipu-remove-model-btn"
              onClick={() => void handleRemoveModel()}
              disabled={removingModel}
            >
              {removingModel ? '删除中…' : '删除当前自定义模型'}
            </button>
          )}
        </div>
      </div>

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

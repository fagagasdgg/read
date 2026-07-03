import { useEffect, useState } from 'react'
import { probeDoubaoApiKey } from '../../services/llm/doubaoClient'
import {
  addCustomDoubaoModel,
  DOUBAO_BUILTIN_MODELS,
  DOUBAO_DEFAULT_MODEL,
  getAllDoubaoModels,
  getDoubaoModelOption,
  hideDoubaoModel,
  isBuiltInDoubaoModel,
  isCustomDoubaoModel,
  loadDoubaoSettings,
  maskApiKey,
  removeCustomDoubaoModel,
  saveDoubaoSettings,
  unhideDoubaoModel,
  type DoubaoSettings,
} from '../../services/llm/doubaoSettings'

function formatTokenCount(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}K tokens`
  return `${value} tokens`
}

interface DoubaoApiSectionProps {
  embedded?: boolean
}

export function DoubaoApiSection({ embedded = false }: DoubaoApiSectionProps) {
  const [settings, setSettings] = useState<DoubaoSettings | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [modelId, setModelId] = useState(DOUBAO_DEFAULT_MODEL)
  const [newModelId, setNewModelId] = useState('')
  const [newModelLabel, setNewModelLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingModel, setAddingModel] = useState(false)
  const [removingModelId, setRemovingModelId] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void loadDoubaoSettings().then((loaded) => {
      setSettings(loaded)
      setApiKeyInput(loaded.apiKey)
      setModelId(loaded.model)
    })
  }, [])

  const customModels = settings?.customModels ?? []
  const hiddenModelIds = settings?.hiddenModelIds ?? []
  const allModels = getAllDoubaoModels(customModels, hiddenModelIds)
  const selectedModel = getDoubaoModelOption(modelId, customModels, hiddenModelIds)
  const hiddenModels = [...DOUBAO_BUILTIN_MODELS, ...customModels].filter((item) =>
    hiddenModelIds.includes(item.id),
  )

  async function handleSave() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const next = await saveDoubaoSettings({ apiKey: apiKeyInput, model: modelId })
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
      await probeDoubaoApiKey(key, modelId, customModels, hiddenModelIds)
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
      const next = await addCustomDoubaoModel(newModelId, newModelLabel)
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

  async function handleRemoveModel(id: string) {
    setRemovingModelId(id)
    setError('')
    setMessage('')
    try {
      const wasCustom = isCustomDoubaoModel(id, customModels)
      const next = wasCustom ? await removeCustomDoubaoModel(id) : await hideDoubaoModel(id)
      setSettings(next)
      setModelId(next.model)
      setMessage(wasCustom ? '已删除自定义模型' : '已从列表移除')
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setRemovingModelId(null)
    }
  }

  async function handleRestoreModel(id: string) {
    setError('')
    setMessage('')
    try {
      const next = await unhideDoubaoModel(id)
      setSettings(next)
      setMessage('已恢复模型')
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败')
    }
  }

  const content = (
    <>
      {!embedded && <h4 className="settings-section-title">深度解析（豆包 API）</h4>}
      <p className="settings-section-note">
        使用火山引擎方舟豆包大模型。请在{' '}
        <a href="https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey" target="_blank" rel="noreferrer">
          火山方舟控制台
        </a>{' '}
        创建 API Key；模型 ID 可为预设名或接入点 ep-xxx。Key 仅保存在本机。
      </p>

      <label className="reader-setting-row zhipu-key-row">
        <span>API Key</span>
        <input
          className="zhipu-key-input"
          type="password"
          autoComplete="off"
          placeholder="粘贴豆包 API Key"
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
              {isCustomDoubaoModel(item.id, customModels) ? ' ·自定义' : ''}
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

      {allModels.length > 0 && (
        <div className="llm-model-manager">
          <p className="settings-section-note">模型管理（移除后不再出现在下拉列表）</p>
          <ul className="llm-model-manager-list">
            {allModels.map((item) => (
              <li key={item.id} className="llm-model-manager-item">
                <span className="llm-model-manager-label">
                  {item.label}
                  {isBuiltInDoubaoModel(item.id) ? ' ·内置' : ' ·自定义'}
                </span>
                <button
                  type="button"
                  className="llm-model-manager-remove"
                  disabled={removingModelId === item.id}
                  onClick={() => void handleRemoveModel(item.id)}
                >
                  {removingModelId === item.id ? '…' : '移除'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hiddenModels.length > 0 && (
        <div className="llm-model-manager llm-model-manager-hidden">
          <p className="settings-section-note">已移除的模型</p>
          <ul className="llm-model-manager-list">
            {hiddenModels.map((item) => (
              <li key={item.id} className="llm-model-manager-item">
                <span className="llm-model-manager-label">{item.label}</span>
                <button
                  type="button"
                  className="llm-model-manager-restore"
                  onClick={() => void handleRestoreModel(item.id)}
                >
                  恢复
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="zhipu-custom-model-block">
        <p className="settings-section-note">添加自定义模型/接入点 ID</p>
        <label className="reader-setting-row zhipu-key-row">
          <span>模型 ID</span>
          <input
            className="zhipu-key-input"
            type="text"
            autoComplete="off"
            placeholder="例如 ep-20250117xxxx 或 doubao-pro-32k"
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
    </>
  )

  if (embedded) return content
  return <section className="settings-section">{content}</section>
}

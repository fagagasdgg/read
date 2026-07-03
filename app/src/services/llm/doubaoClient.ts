import type { DoubaoModelOption, DoubaoSettings } from './doubaoSettings'
import { getDoubaoModelOption } from './doubaoSettings'

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

export interface DoubaoChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface DoubaoChoice {
  message?: { content?: string }
  finish_reason?: string
}

interface DoubaoChatResponse {
  choices?: DoubaoChoice[]
  error?: { message?: string; code?: string }
}

function parseApiError(status: number, body: string): string {
  try {
    const data = JSON.parse(body) as DoubaoChatResponse
    if (data.error?.message) return data.error.message
  } catch {
    // ignore
  }
  if (status === 401) return 'API Key 无效，请在设置中检查'
  if (status === 429) return '请求过于频繁，请稍后再试'
  return `豆包 API 请求失败（${status}）`
}

function resolveMaxTokens(
  model: string,
  customModels: DoubaoModelOption[],
  hiddenModelIds: string[],
  requested?: number,
): number {
  const option = getDoubaoModelOption(model, customModels, hiddenModelIds)
  const cap = option?.maxOutputTokens ?? 4096
  const value = requested ?? Math.min(cap, 2048)
  return Math.min(cap, Math.max(1, value))
}

export async function doubaoChatCompletion(
  settings: Pick<DoubaoSettings, 'apiKey' | 'model' | 'customModels' | 'hiddenModelIds'>,
  messages: DoubaoChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const apiKey = settings.apiKey.trim()
  if (!apiKey) throw new Error('请先在「设置」中配置豆包 API Key')

  const response = await fetch(DOUBAO_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: resolveMaxTokens(
        settings.model,
        settings.customModels ?? [],
        settings.hiddenModelIds ?? [],
        options?.maxTokens,
      ),
      stream: false,
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(parseApiError(response.status, raw))
  }

  let data: DoubaoChatResponse
  try {
    data = JSON.parse(raw) as DoubaoChatResponse
  } catch {
    throw new Error('豆包返回格式异常')
  }

  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) {
    const reason = data.choices?.[0]?.finish_reason ? `（${data.choices[0].finish_reason}）` : ''
    throw new Error(`豆包未返回有效内容${reason}`)
  }
  return content
}

export async function probeDoubaoApiKey(
  apiKey: string,
  model: string,
  customModels: DoubaoModelOption[] = [],
  hiddenModelIds: string[] = [],
): Promise<string> {
  return doubaoChatCompletion(
    { apiKey, model, customModels, hiddenModelIds },
    [{ role: 'user', content: '请只回复 OK' }],
    { maxTokens: 16, temperature: 0.1 },
  )
}

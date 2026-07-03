import type { ZhipuSettings } from './zhipuSettings'

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

export interface ZhipuChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ZhipuChoice {
  message?: { content?: string }
}

interface ZhipuChatResponse {
  choices?: ZhipuChoice[]
  error?: { message?: string; code?: string }
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

function parseApiError(status: number, body: string): string {
  try {
    const data = JSON.parse(body) as ZhipuChatResponse
    if (data.error?.message) return data.error.message
  } catch {
    // ignore
  }
  if (status === 401) return 'API Key 无效，请在设置中检查'
  if (status === 429) return '请求过于频繁，请稍后再试'
  return `智谱 API 请求失败（${status}）`
}

export async function zhipuChatCompletion(
  settings: Pick<ZhipuSettings, 'apiKey' | 'model'>,
  messages: ZhipuChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const apiKey = settings.apiKey.trim()
  if (!apiKey) throw new Error('请先在「设置」中配置智谱 API Key')

  const response = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: buildAuthHeaders(apiKey),
    body: JSON.stringify({
      model: settings.model || 'glm-4.5-flash',
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 1200,
      stream: false,
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(parseApiError(response.status, raw))
  }

  let data: ZhipuChatResponse
  try {
    data = JSON.parse(raw) as ZhipuChatResponse
  } catch {
    throw new Error('智谱返回格式异常')
  }

  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('智谱未返回有效内容')
  return content
}

/** 发送极简请求以验证 Key 是否可用 */
export async function probeZhipuApiKey(apiKey: string, model: string): Promise<string> {
  const reply = await zhipuChatCompletion(
    { apiKey, model },
    [{ role: 'user', content: '回复 OK' }],
    { maxTokens: 8, temperature: 0.1 },
  )
  return reply
}

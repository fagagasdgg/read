import type { ZhipuSettings } from './zhipuSettings'

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

export interface ZhipuChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ZhipuMessage {
  content?: string | Array<string | { type?: string; text?: string }>
  reasoning_content?: string
}

interface ZhipuChoice {
  message?: ZhipuMessage
  finish_reason?: string
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

function extractMessageContent(message: ZhipuMessage | undefined): string {
  if (!message) return ''

  const content = message.content
  if (typeof content === 'string' && content.trim()) return content.trim()

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === 'string') return part
        return part?.text ?? ''
      })
      .join('')
      .trim()
    if (joined) return joined
  }

  // 思考模式可能把输出放在 reasoning_content；深度解析应关闭 thinking，此处作兜底
  if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim()) {
    return message.reasoning_content.trim()
  }

  return ''
}

function buildRequestBody(
  settings: Pick<ZhipuSettings, 'model'>,
  messages: ZhipuChatMessage[],
  options?: { temperature?: number; maxTokens?: number; thinkingEnabled?: boolean },
) {
  return {
    model: settings.model,
    messages,
    thinking: { type: options?.thinkingEnabled ? 'enabled' : 'disabled' },
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 1200,
    stream: false,
  }
}

export async function zhipuChatCompletion(
  settings: Pick<ZhipuSettings, 'apiKey' | 'model'>,
  messages: ZhipuChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const apiKey = settings.apiKey.trim()
  if (!apiKey) throw new Error('请先在「设置」中配置智谱 API Key')

  async function requestOnce(thinkingEnabled: boolean): Promise<string> {
    const response = await fetch(ZHIPU_API_URL, {
      method: 'POST',
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify(buildRequestBody(settings, messages, { ...options, thinkingEnabled })),
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

    const choice = data.choices?.[0]
    const content = extractMessageContent(choice?.message)
    if (!content) {
      const reason = choice?.finish_reason ? `（${choice.finish_reason}）` : ''
      throw new Error(`智谱未返回有效内容${reason}`)
    }
    return content
  }

  try {
    return await requestOnce(false)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (!message.includes('智谱未返回有效内容')) throw err
    return requestOnce(true)
  }
}

/** 发送极简请求以验证 Key 是否可用 */
export async function probeZhipuApiKey(apiKey: string, model: string): Promise<string> {
  const reply = await zhipuChatCompletion(
    { apiKey, model },
    [{ role: 'user', content: '请只回复 OK 两个字母' }],
    { maxTokens: 64, temperature: 0.1 },
  )
  return reply
}

import { Capacitor } from '@capacitor/core'
import { formatTraditionalTranslation } from './formatTranslation'

const FANYI_DIRECT = 'https://fanyi.youdao.com/translate'
const FANYI_PROXY = '/api/youdao-fanyi'

interface TranslateSegment {
  tgt?: string
  src?: string
}

interface TranslateResponse {
  translateResult?: TranslateSegment[][]
  errorCode?: number
}

function buildTranslateUrl(): string {
  return Capacitor.isNativePlatform() ? FANYI_DIRECT : FANYI_PROXY
}

export async function translateTraditional(text: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('请先选择要翻译的文本')

  const body = new URLSearchParams({
    i: trimmed,
    from: 'AUTO',
    to: 'zh-CHS',
    smartresult: 'dict',
    client: 'fanyideskweb',
    doctype: 'json',
    version: '2.1',
    keyfrom: 'fanyi.web',
    action: 'FY_BY_CLICKBUTTION',
  })

  const response = await fetch(buildTranslateUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Referer: 'https://fanyi.youdao.com/',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    throw new Error(`翻译请求失败（${response.status}）`)
  }

  const data = (await response.json()) as TranslateResponse
  if (data.errorCode && data.errorCode !== 0) {
    throw new Error('翻译服务暂时不可用')
  }

  const segments = data.translateResult?.flat() ?? []
  const raw = segments.map((item) => item.tgt?.trim() ?? '').filter(Boolean).join('')
  if (!raw) throw new Error('未获取到翻译结果')

  return formatTraditionalTranslation(raw)
}

import { Capacitor } from '@capacitor/core'
import { md5 } from 'js-md5'
import { formatTraditionalTranslation } from './formatTranslation'

const FANYI_DIRECT = 'https://fanyi.youdao.com/translate?smartresult=dict&smartresult=rule'
const FANYI_PROXY = '/api/youdao-fanyi/translate?smartresult=dict&smartresult=rule'

const FANYI_CLIENT = 'fanyideskweb'
const FANYI_SECRET = 'Y2FYu%TNSbMCxc3t2u^XT'
const FANYI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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

function buildSignedParams(text: string): URLSearchParams {
  const lts = String(Date.now())
  const salt = lts + String(Math.floor(Math.random() * 10))
  const sign = md5(`${FANYI_CLIENT}${text}${salt}${FANYI_SECRET}`)
  const bv = md5(FANYI_UA)

  return new URLSearchParams({
    i: text,
    from: 'AUTO',
    to: 'zh-CHS',
    smartresult: 'dict',
    client: FANYI_CLIENT,
    salt,
    sign,
    lts,
    bv,
    doctype: 'json',
    version: '2.1',
    keyfrom: 'fanyi.web',
    action: 'FY_BY_CLICKBUTTION',
  })
}

function parseTranslateResponse(raw: string): TranslateResponse {
  const trimmed = raw.trim()
  if (trimmed.startsWith('<')) {
    throw new Error('翻译服务暂时不可用，请稍后重试')
  }
  try {
    return JSON.parse(trimmed) as TranslateResponse
  } catch {
    throw new Error('翻译结果解析失败，请稍后重试')
  }
}

export async function translateTraditional(text: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('请先选择要翻译的文本')

  const response = await fetch(buildTranslateUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Referer: 'https://fanyi.youdao.com/',
      'User-Agent': FANYI_UA,
    },
    body: buildSignedParams(trimmed).toString(),
  })

  if (!response.ok) {
    throw new Error(`翻译请求失败（${response.status}）`)
  }

  const data = parseTranslateResponse(await response.text())
  if (data.errorCode && data.errorCode !== 0) {
    throw new Error('翻译服务暂时不可用')
  }

  const segments = data.translateResult?.flat() ?? []
  const raw = segments.map((item) => item.tgt?.trim() ?? '').filter(Boolean).join('')
  if (!raw) throw new Error('未获取到翻译结果')

  return formatTraditionalTranslation(raw)
}

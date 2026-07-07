import { Capacitor } from '@capacitor/core'
import { md5 } from 'js-md5'
import type { ExamLevel, WordDefinition, WordEntry, WordForm } from './types'

const ICIBA_PATH = '/dictionary/word/query/web'
const ICIBA_DIRECT = `https://dict.iciba.com${ICIBA_PATH}`
const ICIBA_PROXY = `/api/iciba${ICIBA_PATH}`
const SIGN_SALT = '7ece94d9f9c202b0d2ec557dg4r9bc'

interface IcibaPart {
  part?: string
  means?: string[]
  word_mean?: string
}

interface IcibaSymbols {
  ph_en?: string
  ph_am?: string
  ph_en_mp3_bk?: string
  ph_am_mp3_bk?: string
  ph_tts_mp3_bk?: string
  parts?: IcibaPart[]
}

interface IcibaMessage {
  baesInfo?: {
    word_name?: string
    exchange?: Record<string, string[]>
    symbols?: IcibaSymbols[]
  }
  bidec?: {
    parts?: Array<{
      part_name?: string
      means?: Array<{ word_mean?: string }>
    }>
  }
  gaokao?: unknown[]
  cetFour?: unknown[]
  cetSix?: unknown[]
  kaoyan?: unknown[]
  exchanges?: string[]
}

interface IcibaResponse {
  status?: number
  message?: IcibaMessage
}

function buildSignedUrl(lemma: string): string {
  const params: Record<string, string | number> = {
    client: 6,
    key: 1000006,
    timestamp: Date.now(),
    word: lemma,
  }

  let concat = ''
  for (const value of Object.values(params)) {
    concat += String(value)
  }
  const signature = md5(`${ICIBA_PATH}${concat}${SIGN_SALT}`)
  const query = new URLSearchParams({
    client: String(params.client),
    key: String(params.key),
    timestamp: String(params.timestamp),
    word: String(params.word),
    signature,
  })

  const base = Capacitor.isNativePlatform() ? ICIBA_DIRECT : ICIBA_PROXY
  return `${base}?${query.toString()}`
}

function parseExamLevels(message: IcibaMessage): ExamLevel[] {
  const levels: ExamLevel[] = []
  if (message.gaokao?.length) levels.push('高考')
  if (message.cetFour?.length) levels.push('CET4')
  if (message.cetSix?.length) levels.push('CET6')
  if (message.kaoyan?.length) levels.push('考研')
  return levels
}

function parseDefinitions(message: IcibaMessage, symbols: IcibaSymbols | undefined): WordDefinition[] {
  const fromSymbols =
    symbols?.parts
      ?.filter((part) => part.part && part.means?.length)
      .map((part) => ({
        pos: part.part!.trim(),
        translation: part.means!.join('；'),
      })) ?? []

  if (fromSymbols.length) return fromSymbols

  const fromBidec =
    message.bidec?.parts
      ?.filter((part) => part.part_name && part.means?.length)
      .map((part) => ({
        pos: part.part_name!.trim(),
        translation: part.means!
          .map((item) => item.word_mean?.trim())
          .filter(Boolean)
          .join('；'),
      }))
      .filter((item) => item.translation) ?? []

  return fromBidec
}

const EXCHANGE_LABELS: Record<string, string> = {
  word_pl: '复数',
  word_past: '过去式',
  word_done: '过去分词',
  word_ing: '现在分词',
  word_third: '第三人称单数',
  word_er: '比较级',
  word_est: '最高级',
}

function normalizeIcibaSpeechUrl(url: string | undefined): string {
  const trimmed = url?.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) return `https://res.iciba.com${trimmed}`
  return `https://res.iciba.com/${trimmed}`
}

function parseForms(message: IcibaMessage): WordForm[] {
  const forms: WordForm[] = []
  const exchange = message.baesInfo?.exchange
  if (exchange) {
    for (const [key, values] of Object.entries(exchange)) {
      const label = EXCHANGE_LABELS[key] ?? key
      for (const value of values) {
        if (value) forms.push({ label, value })
      }
    }
  }

  const exchanges = message.exchanges ?? []
  for (const value of exchanges) {
    if (!value || forms.some((form) => form.value === value)) continue
    forms.push({ label: '词形', value })
  }

  return forms
}

export async function fetchFromIciba(lemma: string): Promise<WordEntry | null> {
  const url = buildSignedUrl(lemma)

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error(
      Capacitor.isNativePlatform()
        ? '金山词霸请求失败，请检查网络连接'
        : '金山词霸请求失败（浏览器跨域限制），请确认开发服务器已启动',
    )
  }

  if (!response.ok) {
    throw new Error(`金山词霸请求失败: ${response.status}`)
  }

  const data = (await response.json()) as IcibaResponse
  if (data.status !== 1 || !data.message) return null

  const message = data.message
  const symbols = message.baesInfo?.symbols?.[0]
  const definitions = parseDefinitions(message, symbols)
  if (!definitions.length) return null

  return {
    lemma,
    phoneticUs: symbols?.ph_am ?? '',
    phoneticUk: symbols?.ph_en ?? '',
    usSpeechUrl: normalizeIcibaSpeechUrl(symbols?.ph_am_mp3_bk ?? symbols?.ph_tts_mp3_bk),
    ukSpeechUrl: normalizeIcibaSpeechUrl(symbols?.ph_en_mp3_bk ?? symbols?.ph_tts_mp3_bk),
    examLevels: parseExamLevels(message),
    definitions,
    forms: parseForms(message),
    cachedAt: Date.now(),
    source: 'iciba',
  }
}

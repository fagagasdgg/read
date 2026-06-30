import { Capacitor } from '@capacitor/core'
import type { WordDefinition, WordEntry, WordForm } from './types'

const YOUDAO_DIRECT = 'https://dict.youdao.com/jsonapi_s'
const YOUDAO_PROXY = '/api/youdao'
const VOICE_BASE = 'https://dict.youdao.com/dictvoice'

interface YoudaoEcWord {
  usphone?: string
  ukphone?: string
  usspeech?: string
  ukspeech?: string
  trs?: Array<{ pos?: string; tran?: string }>
  wfs?: Array<{ wf?: { name?: string; value?: string } }>
}

interface YoudaoEcResponse {
  ec?: {
    word?: YoudaoEcWord
    exam_type?: string[]
  }
}

function buildLookupUrl(lemma: string): string {
  const params = `doctype=json&jsonversion=4&q=${encodeURIComponent(lemma)}`
  // 浏览器开发环境走 Vite 代理，规避 CORS；APK 内走原生 HTTP
  const base = Capacitor.isNativePlatform() ? YOUDAO_DIRECT : YOUDAO_PROXY
  return `${base}?${params}`
}

function buildSpeechUrl(speech: string | undefined, lemma: string, type: 1 | 2): string {
  const audio = speech?.split('&')[0] ?? lemma
  return `${VOICE_BASE}?audio=${encodeURIComponent(audio)}&type=${type}`
}

function parseDefinitions(trs: YoudaoEcWord['trs']): WordDefinition[] {
  if (!trs?.length) return []

  return trs
    .filter((item) => item.tran?.trim())
    .map((item) => ({
      pos: item.pos?.trim() || undefined,
      translation: item.tran!.trim(),
    }))
}

function parseForms(wfs: YoudaoEcWord['wfs']): WordForm[] {
  if (!wfs?.length) return []

  return wfs
    .map((item) => item.wf)
    .filter((wf): wf is { name: string; value: string } => Boolean(wf?.name && wf?.value))
    .map((wf) => ({ label: wf.name, value: wf.value }))
}

export async function fetchFromYoudao(lemma: string): Promise<WordEntry | null> {
  const url = buildLookupUrl(lemma)

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error(
      Capacitor.isNativePlatform()
        ? '网络请求失败，请检查网络连接'
        : '网络请求失败（浏览器跨域限制），请确认开发服务器已启动',
    )
  }

  if (!response.ok) {
    throw new Error(`词典请求失败: ${response.status}`)
  }

  const data = (await response.json()) as YoudaoEcResponse
  const word = data.ec?.word
  if (!word) return null

  const definitions = parseDefinitions(word.trs)
  if (!definitions.length) return null

  return {
    lemma,
    phoneticUs: word.usphone ?? '',
    phoneticUk: word.ukphone ?? '',
    usSpeechUrl: buildSpeechUrl(word.usspeech, lemma, 2),
    ukSpeechUrl: buildSpeechUrl(word.ukspeech, lemma, 1),
    examLevels: data.ec?.exam_type ?? [],
    definitions,
    forms: parseForms(word.wfs),
    cachedAt: Date.now(),
    source: 'youdao',
  }
}

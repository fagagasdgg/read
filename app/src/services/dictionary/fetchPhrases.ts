import { Capacitor } from '@capacitor/core'
import { pickYoudaoText } from '../../lib/pickYoudaoText'

const YOUDAO_DIRECT = 'https://dict.youdao.com/jsonapi_s'
const YOUDAO_PROXY = '/api/youdao'

export interface FetchedPhrase {
  phrase: string
  translation: string
}

interface YoudaoPhraseTr {
  tr?: unknown
  l?: unknown
}

interface YoudaoPhraseItem {
  phr?: {
    headword?: unknown
    trs?: Array<{ tr?: unknown } | YoudaoPhraseTr>
  }
}

interface YoudaoPhraseResponse {
  phrs?: {
    phrs?: YoudaoPhraseItem[] | string
  }
}

function buildPhraseLookupUrl(lemma: string): string {
  const params = `doctype=json&jsonversion=4&q=${encodeURIComponent(lemma)}`
  const base = Capacitor.isNativePlatform() ? YOUDAO_DIRECT : YOUDAO_PROXY
  return `${base}?${params}`
}

function normalizePhraseKey(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, ' ')
}

function dedupePhrases(items: FetchedPhrase[]): FetchedPhrase[] {
  const seen = new Set<string>()
  const result: FetchedPhrase[] = []

  for (const item of items) {
    const phrase = item.phrase.trim()
    const translation = item.translation.trim()
    if (!phrase || !translation) continue

    const key = normalizePhraseKey(phrase)
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ phrase, translation })
  }

  return result
}

function parseTranslation(trNode: unknown): string {
  if (!trNode) return ''

  if (Array.isArray(trNode)) {
    return trNode.map((item) => parseTranslation(item)).filter(Boolean).join('；')
  }

  if (typeof trNode === 'object' && trNode !== null) {
    const obj = trNode as Record<string, unknown>
    if ('l' in obj) return pickYoudaoText(obj.l)
    if ('i' in obj) return pickYoudaoText(obj.i)
  }

  return pickYoudaoText(trNode)
}

function parseYoudaoPhrases(data: YoudaoPhraseResponse): FetchedPhrase[] {
  const raw = data.phrs?.phrs
  if (!raw || typeof raw === 'string' || !Array.isArray(raw)) return []

  const items: FetchedPhrase[] = []

  for (const entry of raw) {
    const phr = entry.phr
    if (!phr) continue

    const phrase = pickYoudaoText(phr.headword)
    const translations = (phr.trs ?? [])
      .map((item) => parseTranslation('tr' in item ? item.tr : item))
      .filter(Boolean)

    if (!phrase || !translations.length) continue

    items.push({
      phrase,
      translation: translations.join('；'),
    })
  }

  return dedupePhrases(items)
}

export async function fetchPhrasesFromYoudao(lemma: string): Promise<FetchedPhrase[]> {
  const url = buildPhraseLookupUrl(lemma)

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error(
      Capacitor.isNativePlatform()
        ? '网络连接失败，请检查网络后重试'
        : '网络请求失败，请确认开发服务器已启动',
    )
  }

  if (!response.ok) {
    throw new Error('词组获取失败，请稍后再试')
  }

  const data = (await response.json()) as YoudaoPhraseResponse
  return parseYoudaoPhrases(data)
}

export async function fetchPhrasesOnline(lemma: string): Promise<FetchedPhrase[]> {
  const phrases = await fetchPhrasesFromYoudao(lemma)
  if (!phrases.length) {
    throw new Error('未找到该词的词组搭配，你可以手动补充')
  }
  return phrases
}

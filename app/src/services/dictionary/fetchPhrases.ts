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

interface YoudaoPhraseFlatItem {
  headword?: string
  translation?: string
}

interface YoudaoPhraseItem {
  phr?: {
    headword?: unknown
    translation?: string
    trs?: Array<{ tr?: unknown } | YoudaoPhraseTr>
  }
  headword?: string
  translation?: string
}

interface YoudaoPhraseResponse {
  phrs?: {
    phrs?: Array<YoudaoPhraseItem | YoudaoPhraseFlatItem> | string
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
    // jsonapi_s v4 扁平格式：{ headword, translation }
    if (typeof entry.headword === 'string' && typeof entry.translation === 'string') {
      const phrase = entry.headword.trim()
      const translation = entry.translation.trim()
      if (phrase && translation) {
        items.push({ phrase, translation })
      }
      continue
    }

    // 旧版嵌套格式：{ phr: { headword, trs } }
    const phr = 'phr' in entry ? entry.phr : undefined
    if (!phr) continue

    if (typeof phr.translation === 'string' && phr.translation.trim()) {
      const phrase = pickYoudaoText(phr.headword)
      if (phrase) {
        items.push({ phrase, translation: phr.translation.trim() })
      }
      continue
    }

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

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { normalizeExamTag } from '../../lib/examLevel'
import type { ExamLevel, WordDefinition, WordEntry, WordForm, WordFrequencyInfo } from './types'

export interface EcdictRow {
  word: string
  phonetic: string
  definition: string
  translation: string
  pos: string
  collins: number
  oxford: number
  tag: string
  bnc: number
  frq: number
  exchange: string
  detail: string
  audio: string
  sw: string
}

const VOICE_BASE = 'https://dict.youdao.com/dictvoice'

const EXCHANGE_CODE_LABELS: Record<string, string> = {
  p: '过去式',
  d: '过去分词',
  i: '现在分词',
  '3': '第三人称单数',
  s: '名词复数',
  r: '比较级',
  t: '最高级',
}

const TAG_TO_LEVEL: Record<string, string> = {
  zk: '中考',
  gk: '高考',
  cet4: 'CET4',
  cet6: 'CET6',
  ky: '考研',
  ielts: '雅思',
  toefl: '托福',
  gre: 'GRE',
}

let sqlPromise: Promise<SqlJsStatic> | null = null
let dbPromise: Promise<Database | null> | null = null

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => wasmUrl })
  }
  return sqlPromise
}

/** 懒加载 ECDICT；文件缺失时返回 null，查词回退联网。 */
export function getEcdictDb(): Promise<Database | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const SQL = await getSql()
        const response = await fetch(`${import.meta.env.BASE_URL}dict/ecdict.db`)
        if (!response.ok) {
          console.warn('[ecdict] db missing:', response.status)
          return null
        }
        const buffer = await response.arrayBuffer()
        return new SQL.Database(new Uint8Array(buffer))
      } catch (err) {
        console.warn('[ecdict] load failed', err)
        return null
      }
    })()
  }
  return dbPromise
}

function buildSpeechUrl(lemma: string, type: 1 | 2): string {
  return `${VOICE_BASE}?audio=${encodeURIComponent(lemma)}&type=${type}`
}

function parseTags(tag: string): ExamLevel[] {
  if (!tag.trim()) return []
  const seen = new Set<string>()
  const levels: ExamLevel[] = []
  for (const part of tag.split(/\s+/)) {
    const key = part.trim().toLowerCase()
    if (!key) continue
    const mapped = TAG_TO_LEVEL[key] ?? key
    const normalized = normalizeExamTag(mapped)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    levels.push(normalized)
  }
  return levels
}

/** CSV/库内常把换行存成字面量 \\n，需还原后再按行拆词性 */
function normalizeTranslationNewlines(translation: string): string {
  return translation
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
}

function parseDefinitions(translation: string): WordDefinition[] {
  const lines = normalizeTranslationNewlines(translation)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return []

  return lines.map((line) => {
    const m = line.match(/^([a-zA-Z]+\.?)\s+(.+)$/)
    if (m) {
      return { pos: m[1].replace(/\.$/, ''), translation: m[2].trim() }
    }
    return { translation: line }
  })
}

/** 将 exchange 中 1:3s / 1:i 等形态码译为中文 */
function decodeFormCodes(raw: string): string {
  const labels: string[] = []
  for (const ch of raw) {
    const label = EXCHANGE_CODE_LABELS[ch]
    if (label && !labels.includes(label)) labels.push(label)
  }
  return labels.length ? labels.join('、') : raw
}

function parseForms(exchange: string): WordForm[] {
  if (!exchange.trim()) return []

  let lemmaRef = ''
  const forms: WordForm[] = []

  for (const part of exchange.split('/')) {
    const item = part.trim()
    if (!item) continue
    const colon = item.indexOf(':')
    if (colon <= 0) continue
    const code = item.slice(0, colon)
    const value = item.slice(colon + 1).trim()
    if (!value) continue

    if (code === '0') {
      lemmaRef = value
      continue
    }

    // 1: 表示「本词相对原型的形态」，值是 s/i/3 等码，不是可跳转单词
    if (code === '1') {
      const kind = decodeFormCodes(value)
      forms.push({
        label: kind,
        value: lemmaRef ? `原型 ${lemmaRef}` : '',
        clickable: false,
      })
      continue
    }

    const label = EXCHANGE_CODE_LABELS[code] ?? code
    forms.push({
      label,
      value,
      clickable: true,
    })
  }

  return forms
}

function rowToEntry(row: EcdictRow): WordEntry | null {
  const definitions = parseDefinitions(row.translation)
  // 无中文翻译时仍保留英文释义，避免丢词
  if (!definitions.length && row.definition.trim()) {
    definitions.push({ translation: row.definition.trim() })
  }
  if (!definitions.length) return null

  const phonetic = row.phonetic.trim()
  const lemma = row.word.trim()
  const collins = row.collins > 0 ? Math.min(5, row.collins) : undefined
  const frequency: WordFrequencyInfo | undefined =
    collins !== undefined || row.bnc > 0 || row.frq > 0 || row.oxford > 0
      ? {
          collinsStar: collins,
          bnc: row.bnc > 0 ? row.bnc : undefined,
          frq: row.frq > 0 ? row.frq : undefined,
          oxford: row.oxford > 0 ? true : undefined,
          fetchedAt: Date.now(),
        }
      : undefined

  return {
    lemma,
    phoneticUs: phonetic,
    phoneticUk: phonetic,
    usSpeechUrl: buildSpeechUrl(lemma, 2),
    ukSpeechUrl: buildSpeechUrl(lemma, 1),
    examLevels: parseTags(row.tag),
    definitions,
    forms: parseForms(row.exchange),
    frequency,
    definitionEn: row.definition.trim() || undefined,
    posDist: row.pos.trim() || undefined,
    exchange: row.exchange.trim() || undefined,
    detail: row.detail.trim() || undefined,
    cachedAt: Date.now(),
    source: 'ecdict',
  }
}

function readRow(db: Database, word: string): EcdictRow | null {
  const stmt = db.prepare(
    `SELECT word, phonetic, definition, translation, pos,
            collins, oxford, tag, bnc, frq, exchange, detail, audio, sw
     FROM ecdict WHERE word = ? COLLATE NOCASE LIMIT 1`,
  )
  try {
    stmt.bind([word])
    if (!stmt.step()) return null
    const raw = stmt.getAsObject() as Record<string, unknown>
    return {
      word: String(raw.word ?? ''),
      phonetic: String(raw.phonetic ?? ''),
      definition: String(raw.definition ?? ''),
      translation: String(raw.translation ?? ''),
      pos: String(raw.pos ?? ''),
      collins: Number(raw.collins) || 0,
      oxford: Number(raw.oxford) || 0,
      tag: String(raw.tag ?? ''),
      bnc: Number(raw.bnc) || 0,
      frq: Number(raw.frq) || 0,
      exchange: String(raw.exchange ?? ''),
      detail: String(raw.detail ?? ''),
      audio: String(raw.audio ?? ''),
      sw: String(raw.sw ?? ''),
    }
  } finally {
    stmt.free()
  }
}

/** 查 lemma_map：变形 → 原型 */
export async function lookupEcdictLemma(form: string): Promise<string | null> {
  const token = form.trim().toLowerCase()
  if (!token) return null
  const db = await getEcdictDb()
  if (!db) return null

  const stmt = db.prepare(
    'SELECT lemma FROM lemma_map WHERE form = ? COLLATE NOCASE LIMIT 1',
  )
  try {
    stmt.bind([token])
    if (!stmt.step()) return null
    const lemma = String(stmt.getAsObject().lemma ?? '').trim().toLowerCase()
    return lemma || null
  } finally {
    stmt.free()
  }
}

/** 按原词精确查询 ECDICT（不做还原） */
export async function lookupEcdictExact(word: string): Promise<WordEntry | null> {
  const token = word.trim()
  if (!token) return null
  const db = await getEcdictDb()
  if (!db) return null

  const row = readRow(db, token)
  if (!row) return null
  return rowToEntry(row)
}

/**
 * ECDICT 查词：若 form 在 lemma_map 中映射到不同原型，优先查原型
 *（阅读场景下 grains→grain，避免命中冷僻同形词条）。
 */
export async function lookupFromEcdict(word: string): Promise<WordEntry | null> {
  const token = word.trim()
  if (!token) return null

  const lemma = await lookupEcdictLemma(token)
  if (lemma && lemma !== token.toLowerCase()) {
    const viaLemma = await lookupEcdictExact(lemma)
    if (viaLemma) return viaLemma
  }

  return lookupEcdictExact(token)
}

export async function isEcdictReady(): Promise<boolean> {
  const db = await getEcdictDb()
  return Boolean(db)
}

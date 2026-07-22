import { normalizeWordToken } from '../../lib/lemmatize'
import { parseExamLevelsInput } from '../../lib/examLevel'
import { removeNotFoundLemma, setCachedWord } from './cache'
import { syncNotFoundWordsNotebook } from '../notes/systemNotebooks'
import type { WordDefinition, WordEntry, WordForm } from './types'

export const READ_WORD_EXPORT_MARKER = 'READ_WORD_v1'

export interface ManualWordDraft {
  lemma: string
  phoneticUs: string
  phoneticUk: string
  examLevels: string[]
  definitions: WordDefinition[]
  forms: WordForm[]
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseDefinitions(raw: unknown): WordDefinition[] {
  if (!Array.isArray(raw)) return []

  const result: WordDefinition[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const translation = asText(row.translation)
    if (!translation) continue
    const pos = asText(row.pos)
    result.push({ pos: pos || undefined, translation })
  }
  return result
}

function parseForms(raw: unknown): WordForm[] {
  if (!Array.isArray(raw)) return []

  const result: WordForm[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const label = asText(row.label)
    const value = asText(row.value)
    if (!label || !value) continue
    result.push({ label, value })
  }
  return result
}

export function parseManualWordDraft(rawLemma: string, payload: unknown): ManualWordDraft {
  if (!payload || typeof payload !== 'object') {
    throw new Error('内容格式无效')
  }

  const row = payload as Record<string, unknown>
  const marker = asText(row.marker)
  if (marker && marker !== READ_WORD_EXPORT_MARKER) {
    throw new Error(`不支持的词条标记：${marker}`)
  }

  const lemma = normalizeWordToken(asText(row.lemma) || rawLemma)
  if (!lemma) throw new Error('缺少有效单词')

  const definitions = parseDefinitions(row.definitions)
  if (!definitions.length) throw new Error('请至少填写一条释义')

  return {
    lemma,
    phoneticUs: asText(row.phoneticUs),
    phoneticUk: asText(row.phoneticUk),
    examLevels: parseExamLevelsInput(row.examLevels),
    definitions,
    forms: parseForms(row.forms),
  }
}

export function parseDoubaoWordClipboard(clipboardText: string, expectedLemma: string): ManualWordDraft {
  const trimmed = clipboardText.trim()
  if (!trimmed) throw new Error('内容为空')

  if (trimmed.includes('【硬性规则') || trimmed.includes('READ_WORD_v1')) {
    if (trimmed.includes('【硬性规则') && !trimmed.trimStart().startsWith('{')) {
      throw new Error('仍是发送给豆包的指令，请粘贴豆包的回复')
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('无法解析 JSON，请粘贴豆包返回的完整 JSON')
  }

  return parseManualWordDraft(expectedLemma, parsed)
}

export function draftToWordEntry(draft: ManualWordDraft): WordEntry {
  const lemma = normalizeWordToken(draft.lemma)
  if (!lemma) throw new Error('无效单词')

  return {
    lemma,
    phoneticUs: draft.phoneticUs,
    phoneticUk: draft.phoneticUk,
    usSpeechUrl: '',
    ukSpeechUrl: '',
    examLevels: draft.examLevels,
    definitions: draft.definitions,
    forms: draft.forms,
    cachedAt: Date.now(),
    source: 'youdao',
  }
}

export async function saveManualWordEntry(draft: ManualWordDraft): Promise<WordEntry> {
  const entry = draftToWordEntry(draft)
  await setCachedWord(entry)
  await removeNotFoundLemma(entry.lemma)
  await syncNotFoundWordsNotebook()
  return entry
}

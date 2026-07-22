/** 考试等级从易到难（用于判断是否为生词） */
const LEVEL_RANK: Record<string, number> = {
  中考: 1,
  初中: 1,
  高考: 2,
  高中: 2,
  CET4: 3,
  四级: 3,
  CET6: 4,
  六级: 4,
  考研: 5,
  雅思: 6,
  IELTS: 6,
  托福: 7,
  TOEFL: 7,
  GRE: 8,
}

const LEVEL_LABEL_ZH: Record<string, string> = {
  中考: '中考',
  高考: '高考',
  CET4: '四级',
  CET6: '六级',
  考研: '考研',
  雅思: '雅思',
  托福: '托福',
  GRE: 'GRE',
}

export const EXAM_LEVEL_OPTIONS = [
  '中考',
  '高考',
  'CET4',
  'CET6',
  '考研',
  '雅思',
  '托福',
  'GRE',
] as const

function rankOf(level: string): number {
  const key = normalizeExamTag(level)
  return LEVEL_RANK[key] ?? 99
}

/** 将考试等级标签规范为内部键（如 CET4） */
export function normalizeExamTag(tag: string): string {
  const raw = tag.trim()
  const upper = raw.toUpperCase()

  if (upper.includes('CET4') || raw.includes('四级')) return 'CET4'
  if (upper.includes('CET6') || raw.includes('六级')) return 'CET6'
  if (raw.includes('中考') || raw.includes('初中')) return '中考'
  if (raw.includes('高考') || raw.includes('高中')) return '高考'
  if (raw.includes('考研')) return '考研'
  if (raw.includes('雅思') || upper.includes('IELTS')) return '雅思'
  if (raw.includes('托福') || upper.includes('TOEFL')) return '托福'
  if (upper.includes('GRE')) return 'GRE'

  return raw
}

/** 展示用中文标签 */
export function formatExamLevelLabel(level: string): string {
  const key = normalizeExamTag(level)
  return LEVEL_LABEL_ZH[key] ?? level.trim()
}

/** 去重并排序后的中文等级列表 */
export function formatExamLevelsDisplay(levels: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const level of levels) {
    const key = normalizeExamTag(level)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(formatExamLevelLabel(key))
  }

  return result.sort((a, b) => rankOf(a) - rankOf(b))
}

/** 解析用户或豆包输入的等级字段，返回规范键列表 */
export function parseExamLevelsInput(raw: unknown): string[] {
  const items: string[] = []

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string' && item.trim()) items.push(item.trim())
    }
  } else if (typeof raw === 'string' && raw.trim()) {
    items.push(
      ...raw
        .split(/[,，/|、\s]+/)
        .map((part) => part.trim())
        .filter(Boolean),
    )
  }

  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const key = normalizeExamTag(item)
    if (!LEVEL_LABEL_ZH[key] && !LEVEL_RANK[key]) continue
    if (seen.has(key)) continue
    seen.add(key)
    result.push(key)
  }

  return result.sort((a, b) => rankOf(a) - rankOf(b))
}

/** 单词是否难于用户所选水平（应显示行间翻译） */
export function shouldShowInlineForWord(wordLevels: string[], userLevel: string): boolean {
  const userRank = rankOf(userLevel)
  if (!wordLevels.length) return true

  const easiestWordRank = Math.min(...wordLevels.map(rankOf))
  return easiestWordRank > userRank
}

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

function normalizeExamTag(tag: string): string {
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

function rankOf(level: string): number {
  const key = normalizeExamTag(level)
  return LEVEL_RANK[key] ?? 99
}

/** 单词是否难于用户所选水平（应显示行间翻译） */
export function shouldShowInlineForWord(wordLevels: string[], userLevel: string): boolean {
  const userRank = rankOf(userLevel)
  if (!wordLevels.length) return true

  const easiestWordRank = Math.min(...wordLevels.map(rankOf))
  return easiestWordRank > userRank
}

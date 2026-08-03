import nlp from 'compromise'

const IRREGULAR: Record<string, string> = {
  told: 'tell',
  spoke: 'speak',
  spoken: 'speak',
  went: 'go',
  gone: 'go',
  better: 'good',
  best: 'good',
  worse: 'bad',
  worst: 'bad',
}

/** 统一各类撇号/弯引号为 ASCII '；连字符归一为 - */
function normalizeApostropheChars(raw: string): string {
  return raw
    .replace(/[\u2018\u2019\u201b\u2032\u00b4`＇']/g, "'")
    .replace(/\u00ad/g, '')
    .replace(/[\u2010\u2011\u2012\u2013\u2043\ufe63\uff0d]/g, '-')
}

/**
 * 规范化取词：小写、去杂质，并剥离所有格/缩写尾巴。
 * 例：world's / world’s → world；don't → do；we'll → we
 * 连字符复合词保留：mother-in-law
 */
export function normalizeWordToken(raw: string): string {
  let s = normalizeApostropheChars(raw)
    .toLowerCase()
    .replace(/[^a-z'-]/g, '')

  if (!s) return ''

  // 连字符复合词：保留结构，查词走原词优先
  if (s.includes('-')) {
    return s.replace(/'/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  // don't / isn't / won't → 去掉 n't
  if (s.endsWith("n't")) {
    s = s.slice(0, -3)
  }

  // world's / John's → 去掉 's
  if (s.endsWith("'s")) {
    s = s.slice(0, -2)
  }

  // we'll / they're / we've / I'd / I'm
  const clitic = s.match(/^([a-z]+)'(ll|re|ve|d|m)$/)
  if (clitic) {
    s = clitic[1]
  }

  // boys' → boys
  if (s.endsWith("s'")) {
    s = s.slice(0, -1)
  }

  // 其余：去掉第一个撇号及其后内容（兼容异常写法）
  const apo = s.indexOf("'")
  if (apo > 0) {
    s = s.slice(0, apo)
  }

  return s.replace(/'/g, '')
}

export function toLemma(raw: string): string {
  const token = normalizeWordToken(raw)
  if (!token) return ''

  // 复合词不做 compromise 还原，避免破坏 mother-in-law
  if (token.includes('-')) return token

  if (IRREGULAR[token]) return IRREGULAR[token]

  const doc = nlp(token)
  const verbs = doc.verbs().toInfinitive().out('array') as string[]
  if (verbs[0]) return verbs[0].toLowerCase()

  const nouns = doc.nouns().toSingular().out('array') as string[]
  if (nouns[0]) return nouns[0].toLowerCase()

  return token
}

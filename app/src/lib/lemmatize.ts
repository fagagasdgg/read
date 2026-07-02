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

export function normalizeWordToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032\u00b4']/g, "'")
    .replace(/[^a-z'-]/g, '')
}

export function toLemma(raw: string): string {
  const token = normalizeWordToken(raw)
  if (!token) return ''

  if (IRREGULAR[token]) return IRREGULAR[token]

  const doc = nlp(token)
  const verbs = doc.verbs().toInfinitive().out('array') as string[]
  if (verbs[0]) return verbs[0].toLowerCase()

  const nouns = doc.nouns().toSingular().out('array') as string[]
  if (nouns[0]) return nouns[0].toLowerCase()

  return token
}

import { normalizeWordToken, toLemma } from '../../lib/lemmatize'
import { lookupEcdictLemma } from './ecdict'

/**
 * 本地词形还原：优先 ECDICT lemma_map，否则 compromise。
 * exactToken 时不做还原（变体点击）。
 *
 * 独立模块，避免 phrases/mastered 经 dictionary/index 产生循环依赖。
 */
export async function resolveLemma(rawWord: string, exactToken = false): Promise<string> {
  const surface = normalizeWordToken(rawWord)
  if (!surface) return ''
  if (exactToken) return surface

  const ecLemma = await lookupEcdictLemma(surface)
  if (ecLemma) return ecLemma

  const cLemma = toLemma(rawWord)
  return cLemma || surface
}

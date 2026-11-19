import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { normalizeWordToken } from '../../lib/lemmatize'
import { getCachedWord } from '../dictionary/cache'
import { lookupLocalWord, lookupOnlineWord, resolveLemma } from '../dictionary'

export type WordCliqueKind = 'lookalike' | 'synonym'

export interface WordClique {
  id: string
  lemmas: string[]
  updatedAt: number
}

interface CliqueStore {
  cliques: Record<string, WordClique>
  /** lemma → cliqueId */
  index: Record<string, string>
}

const STORAGE_KEYS: Record<WordCliqueKind, string> = {
  lookalike: 'read-word-lookalikes',
  synonym: 'read-word-synonyms',
}

const memory: Record<WordCliqueKind, CliqueStore | null> = {
  lookalike: null,
  synonym: null,
}

function createId(kind: WordCliqueKind): string {
  const prefix = kind === 'lookalike' ? 'la' : 'sy'
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyStore(): CliqueStore {
  return { cliques: {}, index: {} }
}

async function readStore(kind: WordCliqueKind): Promise<CliqueStore> {
  if (memory[kind]) return memory[kind]!

  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEYS[kind] })
      raw = value
    } else {
      raw = localStorage.getItem(STORAGE_KEYS[kind])
    }

    if (!raw) {
      memory[kind] = emptyStore()
      return memory[kind]!
    }

    const parsed = JSON.parse(raw) as CliqueStore
    if (!parsed || typeof parsed !== 'object') {
      memory[kind] = emptyStore()
      return memory[kind]!
    }

    memory[kind] = {
      cliques: parsed.cliques && typeof parsed.cliques === 'object' ? parsed.cliques : {},
      index: parsed.index && typeof parsed.index === 'object' ? parsed.index : {},
    }
    return memory[kind]!
  } catch {
    memory[kind] = emptyStore()
    return memory[kind]!
  }
}

async function writeStore(kind: WordCliqueKind, store: CliqueStore): Promise<void> {
  memory[kind] = store
  const payload = JSON.stringify(store)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEYS[kind], value: payload })
  } else {
    localStorage.setItem(STORAGE_KEYS[kind], payload)
  }
}

/** 本地（缓存 / ECDICT）优先，否则联网下载；返回可加入关系的 lemma */
export async function ensureWordLemmaForRelation(rawWord: string): Promise<string> {
  const surface = normalizeWordToken(rawWord)
  if (!surface) throw new Error('请输入有效单词')

  const lemma = (await resolveLemma(surface)) || surface

  const cached =
    (await getCachedWord(lemma)) ||
    (lemma !== surface ? await getCachedWord(surface) : null)
  if (cached?.lemma) return cached.lemma

  const local = await lookupLocalWord(surface)
  if (local?.lemma) return local.lemma

  const online = await lookupOnlineWord(surface)
  if (online?.lemma) return online.lemma

  throw new Error(`未找到「${surface}」，无法添加`)
}

export async function listRelatedLemmas(
  kind: WordCliqueKind,
  rawLemma: string,
): Promise<string[]> {
  const lemma = normalizeWordToken(rawLemma)
  if (!lemma) return []
  const store = await readStore(kind)
  const cliqueId = store.index[lemma]
  if (!cliqueId) return []
  const clique = store.cliques[cliqueId]
  if (!clique) return []
  return clique.lemmas.filter((item) => item !== lemma).sort((a, b) => a.localeCompare(b))
}

export async function linkRelatedLemmas(
  kind: WordCliqueKind,
  rawA: string,
  rawB: string,
): Promise<string[]> {
  const a = normalizeWordToken(rawA)
  const b = normalizeWordToken(rawB)
  if (!a || !b) throw new Error('无效单词')
  if (a === b) throw new Error('不能添加自身')

  const store = await readStore(kind)
  const idA = store.index[a]
  const idB = store.index[b]
  const now = Date.now()

  let lemmas = new Set<string>([a, b])
  let keepId = idA || idB || createId(kind)

  if (idA && store.cliques[idA]) {
    for (const item of store.cliques[idA].lemmas) lemmas.add(item)
  }
  if (idB && store.cliques[idB] && idB !== idA) {
    for (const item of store.cliques[idB].lemmas) lemmas.add(item)
  }

  if (idA && idB && idA !== idB) {
    delete store.cliques[idB]
    keepId = idA
  }

  const nextLemmas = Array.from(lemmas).sort((x, y) => x.localeCompare(y))
  store.cliques[keepId] = { id: keepId, lemmas: nextLemmas, updatedAt: now }
  for (const item of nextLemmas) store.index[item] = keepId

  await writeStore(kind, store)
  return nextLemmas.filter((item) => item !== a)
}

/** 将该词整组踢出：同组其它词之间关系保留，与该词的关系全部断开 */
export async function unlinkLemmaFromClique(
  kind: WordCliqueKind,
  rawLemma: string,
): Promise<void> {
  const lemma = normalizeWordToken(rawLemma)
  if (!lemma) return

  const store = await readStore(kind)
  const cliqueId = store.index[lemma]
  if (!cliqueId) return

  const clique = store.cliques[cliqueId]
  if (!clique) {
    delete store.index[lemma]
    await writeStore(kind, store)
    return
  }

  const remain = clique.lemmas.filter((item) => item !== lemma)
  delete store.index[lemma]

  if (remain.length <= 1) {
    delete store.cliques[cliqueId]
    for (const item of remain) delete store.index[item]
  } else {
    store.cliques[cliqueId] = {
      ...clique,
      lemmas: remain,
      updatedAt: Date.now(),
    }
  }

  await writeStore(kind, store)
}

export async function exportCliqueStore(kind: WordCliqueKind): Promise<CliqueStore> {
  const store = await readStore(kind)
  return {
    cliques: { ...store.cliques },
    index: { ...store.index },
  }
}

export async function importCliqueStore(
  kind: WordCliqueKind,
  incoming: CliqueStore | null | undefined,
): Promise<{ merged: number }> {
  if (!incoming || typeof incoming !== 'object') return { merged: 0 }

  const local = await readStore(kind)
  let merged = 0

  const cliques = incoming.cliques && typeof incoming.cliques === 'object' ? incoming.cliques : {}
  for (const clique of Object.values(cliques)) {
    if (!clique || !Array.isArray(clique.lemmas) || clique.lemmas.length < 2) continue
    const lemmas = clique.lemmas.map((item) => normalizeWordToken(item)).filter(Boolean)
    if (lemmas.length < 2) continue
    const base = lemmas[0]
    for (let i = 1; i < lemmas.length; i += 1) {
      await linkRelatedLemmas(kind, base, lemmas[i])
      merged += 1
    }
  }

  // linkRelatedLemmas 会刷新 memory；确保写回后与 local 合并完成
  void local
  return { merged }
}

export function resetCliqueMemoryForTests(): void {
  memory.lookalike = null
  memory.synonym = null
}

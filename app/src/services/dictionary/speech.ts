const VOICE_BASE = 'https://dict.youdao.com/dictvoice'

let playing: HTMLAudioElement | null = null

function normalizeAudioUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return trimmed
}

function stopCurrentAudio(): void {
  if (playing) {
    playing.pause()
    playing = null
  }
}

function playAudioUrl(url: string, onError?: () => void): void {
  stopCurrentAudio()
  const audio = new Audio(url)
  playing = audio
  audio.addEventListener('ended', () => {
    if (playing === audio) playing = null
  })
  audio.addEventListener('error', () => {
    if (playing === audio) playing = null
    onError?.()
  })
  void audio.play().catch(() => {
    if (playing === audio) playing = null
    onError?.()
  })
}

/** 播放时始终用单词原文拼 URL，避免缓存或 API 字段导致发音截断 */
export function playSpeechWord(word: string, type: 1 | 2): void {
  const token = word.trim().toLowerCase()
  if (!token) return

  const url = `${VOICE_BASE}?audio=${encodeURIComponent(token)}&type=${type}`
  playAudioUrl(url)
}

/** 优先外链发音，失败时回退有道 TTS */
export function playSpeechWithFallback(url: string, word: string, type: 1 | 2): void {
  const normalized = normalizeAudioUrl(url)
  if (!normalized) {
    playSpeechWord(word, type)
    return
  }
  playAudioUrl(normalized, () => playSpeechWord(word, type))
}

/** @deprecated 优先使用 playSpeechWord / playSpeechWithFallback */
export function playSpeech(url: string): void {
  if (!url) return

  if (url.includes('dict.youdao.com/dictvoice')) {
    try {
      const parsed = new URL(url.startsWith('//') ? `https:${url}` : url)
      const audio = parsed.searchParams.get('audio')
      const type = Number(parsed.searchParams.get('type') ?? 2) as 1 | 2
      if (audio) {
        playSpeechWord(decodeURIComponent(audio), type === 1 ? 1 : 2)
        return
      }
    } catch {
      // fall through
    }
  }

  playAudioUrl(normalizeAudioUrl(url))
}

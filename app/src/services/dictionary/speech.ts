let playing: HTMLAudioElement | null = null

export function playSpeech(url: string): void {
  if (!url) return

  if (playing) {
    playing.pause()
    playing = null
  }

  const audio = new Audio(url)
  playing = audio
  audio.addEventListener('ended', () => {
    if (playing === audio) playing = null
  })
  void audio.play().catch(() => {
    if (playing === audio) playing = null
  })
}

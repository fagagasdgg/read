import type JSZip from 'jszip'

export interface EpubChapter {
  index: number
  id: string
  href: string
  title: string
}

export interface EpubBook {
  id: string
  title: string
  author: string
  chapters: EpubChapter[]
  zip: JSZip
  opfDir: string
}

export interface ReadingProgress {
  bookId: string
  chapterIndex: number
  updatedAt: number
}

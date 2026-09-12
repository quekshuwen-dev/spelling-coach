import { beforeEach, describe, expect, it } from 'vitest'
import { applyAttempt, wordIdFor, __localRepository } from '../services/wordsRepository'
import type { SpellingWord } from '../types'

/** Minimal localStorage so the local backend can be tested in node. */
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  clear() {
    this.map.clear()
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
})

describe('wordIdFor', () => {
  it('gives the same id to the same word however it is written', () => {
    expect(wordIdFor('Beautiful')).toBe(wordIdFor('beautiful,'))
    expect(wordIdFor(' BEAUTIFUL ')).toBe(wordIdFor('beautiful'))
  })

  it('gives different ids to different words', () => {
    expect(wordIdFor('cat')).not.toBe(wordIdFor('cats'))
  })

  it('produces a safe document id for non-Latin words', () => {
    const id = wordIdFor('水')
    expect(id).toMatch(/^[A-Za-z0-9'-]+$/)
    expect(wordIdFor('水')).toBe(id)
  })
})

describe('applyAttempt', () => {
  const word: SpellingWord = {
    id: 'w',
    word: 'beautiful',
    normalizedWord: 'beautiful',
    lang: 'en',
    createdAt: 0,
    updatedAt: 0,
    source: 'manual',
    status: 'active',
    practiceCount: 2,
    correctCount: 1,
    incorrectCount: 1,
    streak: 1,
  }

  it('counts a correct answer and extends the streak', () => {
    const next = applyAttempt(word, true, 100)
    expect(next).toMatchObject({ practiceCount: 3, correctCount: 2, incorrectCount: 1, streak: 2 })
    expect(next.lastPractisedAt).toBe(100)
  })

  it('resets the streak on a wrong answer', () => {
    expect(applyAttempt(word, false, 100)).toMatchObject({
      practiceCount: 3,
      correctCount: 1,
      incorrectCount: 2,
      streak: 0,
    })
  })
})

describe('local words repository', () => {
  it('saves words and reads them back', async () => {
    const repo = new __localRepository()
    const { added } = await repo.addMany([
      { word: 'Beautiful', source: 'image', sourceImageId: 'img_1' },
      { word: 'garden', source: 'image' },
    ])
    expect(added).toHaveLength(2)
    const list = await repo.list()
    expect(list.map((w) => w.word).sort()).toEqual(['Beautiful', 'garden'])
    expect(list.find((w) => w.word === 'Beautiful')?.sourceImageId).toBe('img_1')
  })

  it('never creates a duplicate word', async () => {
    const repo = new __localRepository()
    await repo.addMany([{ word: 'beautiful', source: 'manual' }])
    const second = await repo.addMany([{ word: 'Beautiful,', source: 'image' }])
    expect(second.added).toHaveLength(0)
    expect(second.duplicates).toEqual(['Beautiful'])
    expect(await repo.list()).toHaveLength(1)
  })

  it('de-duplicates within a single batch', async () => {
    const repo = new __localRepository()
    const { added } = await repo.addMany([
      { word: 'cat', source: 'image' },
      { word: 'Cat', source: 'image' },
    ])
    expect(added).toHaveLength(1)
  })

  it('records an attempt and updates the statistics', async () => {
    const repo = new __localRepository()
    const { added } = await repo.addMany([{ word: 'beautiful', source: 'manual' }])
    const updated = await repo.recordAttempt(added[0], 'beutiful', false, 4200)
    expect(updated).toMatchObject({ practiceCount: 1, incorrectCount: 1, streak: 0 })

    const stored = (await repo.list())[0]
    expect(stored.practiceCount).toBe(1)

    const attempts = await repo.listAttempts()
    expect(attempts[0]).toMatchObject({
      wordId: added[0].id,
      word: 'beautiful',
      answer: 'beutiful',
      correct: false,
      elapsedMs: 4200,
    })
  })

  it('removes a word', async () => {
    const repo = new __localRepository()
    const { added } = await repo.addMany([{ word: 'cat', source: 'manual' }])
    await repo.remove(added[0].id)
    expect(await repo.list()).toHaveLength(0)
  })
})

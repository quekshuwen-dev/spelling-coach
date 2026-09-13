import { beforeEach, describe, expect, it } from 'vitest'
import { applyAttempt, wordIdFor, __localRepository } from '../services/wordsRepository'
import { createProfile, ensureActiveProfile, resetActiveProfileCache, switchActiveProfile } from '../services/profileService'
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
  // ensureActiveProfile() caches the active profile at module scope, not in
  // localStorage — without this, a profile created by an earlier test would
  // leak into the next one even though its storage is otherwise wiped clean.
  resetActiveProfileCache()
})

describe('wordIdFor', () => {
  it('gives the same id to the same word however it is written', () => {
    expect(wordIdFor('Beautiful', 'p1')).toBe(wordIdFor('beautiful,', 'p1'))
    expect(wordIdFor(' BEAUTIFUL ', 'p1')).toBe(wordIdFor('beautiful', 'p1'))
  })

  it('gives different ids to different words', () => {
    expect(wordIdFor('cat', 'p1')).not.toBe(wordIdFor('cats', 'p1'))
  })

  it('produces a safe document id for non-Latin words', () => {
    const id = wordIdFor('水', 'p1')
    expect(id).toMatch(/^[A-Za-z0-9'_-]+$/)
    expect(wordIdFor('水', 'p1')).toBe(id)
  })

  it('gives two profiles different ids for the same word', () => {
    // The whole point of scoping by profile: siblings can each save "cat"
    // without one overwriting the other.
    expect(wordIdFor('cat', 'p1')).not.toBe(wordIdFor('cat', 'p2'))
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
    profileId: 'p1',
    folderId: 'school-english',
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

describe('profiles', () => {
  it('gives each profile its own list, even for the identical word', async () => {
    const repo = new __localRepository()

    const chloe = await ensureActiveProfile('Chloe')
    await repo.addMany([{ word: 'cat', source: 'manual' }])

    const sam = await createProfile('Sam')
    await switchActiveProfile(sam.id)
    await repo.addMany([{ word: 'cat', source: 'manual' }])

    // Sam's list has his "cat" — not two, and not Chloe's.
    const samWords = await repo.list()
    expect(samWords).toHaveLength(1)
    expect(samWords[0].profileId).toBe(sam.id)

    await switchActiveProfile(chloe.id)
    const chloeWords = await repo.list()
    expect(chloeWords).toHaveLength(1)
    expect(chloeWords[0].profileId).toBe(chloe.id)
  })

  it('does not let attempts or a clearAll leak between profiles', async () => {
    const repo = new __localRepository()

    const chloe = await ensureActiveProfile('Chloe')
    const [chloeCat] = (await repo.addMany([{ word: 'cat', source: 'manual' }])).added
    await repo.recordAttempt(chloeCat, 'cat', true)

    const sam = await createProfile('Sam')
    await switchActiveProfile(sam.id)
    const [samCat] = (await repo.addMany([{ word: 'cat', source: 'manual' }])).added
    await repo.recordAttempt(samCat, 'kat', false)

    // Sam clearing his list must not touch Chloe's word or her attempt history.
    await repo.clearAll()
    expect(await repo.list()).toHaveLength(0)
    expect(await repo.listAttempts()).toHaveLength(0)

    await switchActiveProfile(chloe.id)
    expect(await repo.list()).toHaveLength(1)
    expect(await repo.listAttempts()).toHaveLength(1)
  })

  it('migrates a word saved before profiles existed onto whichever profile is active', async () => {
    // Exactly what data saved by the pre-profiles app looks like: no
    // profileId, no folderId. Written as raw JSON, not a typed fixture,
    // because that is what is actually sitting in a real browser's
    // localStorage — the type system would not let this compile as a literal.
    const legacyWord = {
      id: 'legacy_cat',
      word: 'cat',
      normalizedWord: 'cat',
      lang: 'en',
      createdAt: 0,
      updatedAt: 0,
      source: 'manual',
      status: 'active',
      practiceCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      streak: 0,
    }
    localStorage.setItem('sc2_words', JSON.stringify([legacyWord]))

    const repo = new __localRepository()
    const list = await repo.list()

    expect(list).toHaveLength(1)
    expect(list[0].folderId).toBe('school-english') // inferred from lang: 'en'
    expect(typeof list[0].profileId).toBe('string')
    expect((list[0].profileId as string).length).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from 'vitest'
import { buildSession, weightedSample } from '../services/practiceSelection'
import type { SpellingWord } from '../types'

const make = (id: string, patch: Partial<SpellingWord> = {}): SpellingWord => ({
  id,
  word: id,
  normalizedWord: id,
  lang: 'en',
  createdAt: 0,
  updatedAt: 0,
  source: 'manual',
  status: 'active',
  practiceCount: 0,
  correctCount: 0,
  incorrectCount: 0,
  streak: 0,
  profileId: 'p1',
  folderId: 'school-english',
  ...patch,
})

/** Deterministic RNG so a weighted draw can be asserted rather than guessed at. */
const seeded = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('weightedSample', () => {
  it('never returns the same word twice', () => {
    const words = ['a', 'b', 'c', 'd'].map((id) => make(id))
    const picked = weightedSample(words, 4, seeded([0.1, 0.5, 0.9, 0.3]))
    expect(new Set(picked.map((w) => w.id)).size).toBe(4)
  })

  it('cannot return more words than exist', () => {
    expect(weightedSample([make('a')], 5, Math.random)).toHaveLength(1)
  })

  it('favours the word that is answered wrong most often', () => {
    const now = Date.now()
    const words = [
      make('easy', { practiceCount: 10, correctCount: 10, streak: 10, lastPractisedAt: now }),
      make('hard', { practiceCount: 10, correctCount: 1, lastPractisedAt: now }),
    ]
    // Over many draws of one word, "hard" should dominate.
    let hardFirst = 0
    for (let i = 0; i < 200; i++) {
      if (weightedSample(words, 1, Math.random, now)[0].id === 'hard') hardFirst += 1
    }
    expect(hardFirst).toBeGreaterThan(120)
  })
})

describe('buildSession', () => {
  const now = Date.now()
  const words = [
    make('mastered', { practiceCount: 6, correctCount: 6, streak: 6, lastPractisedAt: now }),
    make('weak', { practiceCount: 6, correctCount: 1, lastPractisedAt: now }),
    make('fresh'),
  ]

  it('"all" returns every active word', () => {
    expect(buildSession(words, { mode: 'all', now })).toHaveLength(3)
  })

  it('"selected" returns exactly the ticked words', () => {
    const session = buildSession(words, { mode: 'selected', selectedIds: ['weak', 'fresh'], now })
    expect(session.map((w) => w.id).sort()).toEqual(['fresh', 'weak'])
  })

  it('"needs-practice" leaves out the mastered word', () => {
    const session = buildSession(words, { mode: 'needs-practice', now })
    expect(session.map((w) => w.id)).not.toContain('mastered')
    expect(session.length).toBeGreaterThan(0)
  })

  it('"needs-practice" still returns something when nothing is weak', () => {
    const allStrong = [make('a', { practiceCount: 5, correctCount: 5, streak: 5, lastPractisedAt: now })]
    expect(buildSession(allStrong, { mode: 'needs-practice', now })).toHaveLength(1)
  })

  it('ignores archived words', () => {
    const withArchived = [...words, make('gone', { status: 'archived' })]
    expect(buildSession(withArchived, { mode: 'all', now }).map((w) => w.id)).not.toContain('gone')
  })

  it('caps a random round at the requested size', () => {
    const many = Array.from({ length: 30 }, (_, i) => make(`w${i}`))
    expect(buildSession(many, { mode: 'random', size: 10, now })).toHaveLength(10)
  })
})

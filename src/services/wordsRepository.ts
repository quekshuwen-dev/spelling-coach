/**
 * The word store.
 *
 * One interface, two backends:
 *   - Firestore, when a Firebase config is present (syncs across devices)
 *   - localStorage, otherwise (so the whole journey works with no credentials)
 *
 * Firestore shape — exactly as specified:
 *   users/{userId}
 *   users/{userId}/spellingWords/{wordId}
 *   users/{userId}/spellingWords/{wordId}/attempts/{attemptId}
 *
 * De-duplication is by `normalizedWord`, which is also the document id. That
 * makes a duplicate impossible by construction rather than by a read-then-write
 * race: two devices adding "beautiful" at once converge on one document, and
 * practiceCount keeps counting.
 */
import { ensureSignedIn, firebaseEnabled, getFirebase } from '../lib/firebase'
import { cleanWord, detectLang, normalizeWord } from '../lib/words'
import type { Attempt, SpellingWord, WordSource } from '../types'

export interface AddWordInput {
  word: string
  source: WordSource
  sourceImageId?: string
}

export interface WordsRepository {
  readonly kind: 'firestore' | 'local'
  list(): Promise<SpellingWord[]>
  addMany(inputs: AddWordInput[]): Promise<{ added: SpellingWord[]; duplicates: string[] }>
  update(id: string, patch: Partial<SpellingWord>): Promise<void>
  remove(id: string): Promise<void>
  recordAttempt(word: SpellingWord, answer: string, correct: boolean, elapsedMs?: number): Promise<SpellingWord>
  listAttempts(limit?: number): Promise<Attempt[]>
  clearAll(): Promise<void>
}

/** A document id must be a safe, stable key. Hash anything exotic. */
export function wordIdFor(word: string): string {
  const normalized = normalizeWord(word)
  const safe = normalized.replace(/[^a-z0-9'-]/g, '')
  if (safe.length >= 2 && safe.length === normalized.length) return safe
  // Non-Latin (or punctuation-heavy) words get a deterministic hashed id so
  // the same word always lands on the same document.
  let hash = 5381
  for (let i = 0; i < normalized.length; i++) hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0
  return `w${hash.toString(36)}${normalized.length}`
}

function newWord(input: AddWordInput, now: number): SpellingWord {
  // Clean here, at the single boundary into storage, so no caller can save
  // "Beautiful," no matter which screen it came from.
  const word = cleanWord(input.word)
  return {
    id: wordIdFor(word),
    word,
    normalizedWord: normalizeWord(word),
    lang: detectLang(word),
    createdAt: now,
    updatedAt: now,
    source: input.source,
    ...(input.sourceImageId ? { sourceImageId: input.sourceImageId } : {}),
    status: 'active',
    practiceCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    streak: 0,
  }
}

/** The statistics update applied after every attempt. Shared by both backends. */
export function applyAttempt(word: SpellingWord, correct: boolean, now: number): SpellingWord {
  return {
    ...word,
    practiceCount: word.practiceCount + 1,
    correctCount: word.correctCount + (correct ? 1 : 0),
    incorrectCount: word.incorrectCount + (correct ? 0 : 1),
    streak: correct ? word.streak + 1 : 0,
    lastPractisedAt: now,
    updatedAt: now,
  }
}

/* ----------------------------- local backend ----------------------------- */

const WORDS_KEY = 'sc2_words'
const ATTEMPTS_KEY = 'sc2_attempts'
const MAX_LOCAL_ATTEMPTS = 1000

function readLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function writeLocal<T>(key: string, value: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked — the session still works, it just will not persist */
  }
}

class LocalWordsRepository implements WordsRepository {
  readonly kind = 'local' as const

  async list(): Promise<SpellingWord[]> {
    return readLocal<SpellingWord>(WORDS_KEY).filter((w) => w.status !== 'archived')
  }

  async addMany(inputs: AddWordInput[]) {
    const now = Date.now()
    const existing = readLocal<SpellingWord>(WORDS_KEY)
    const byId = new Map(existing.map((w) => [w.id, w]))
    const added: SpellingWord[] = []
    const duplicates: string[] = []

    for (const input of inputs) {
      if (!input.word.trim()) continue
      const candidate = newWord(input, now)
      if (byId.has(candidate.id)) {
        duplicates.push(candidate.word)
        continue
      }
      byId.set(candidate.id, candidate)
      added.push(candidate)
    }

    writeLocal(WORDS_KEY, [...byId.values()])
    return { added, duplicates }
  }

  async update(id: string, patch: Partial<SpellingWord>) {
    const words = readLocal<SpellingWord>(WORDS_KEY)
    const next = words.map((w) => (w.id === id ? { ...w, ...patch, updatedAt: Date.now() } : w))
    writeLocal(WORDS_KEY, next)
  }

  async remove(id: string) {
    writeLocal(
      WORDS_KEY,
      readLocal<SpellingWord>(WORDS_KEY).filter((w) => w.id !== id),
    )
  }

  async recordAttempt(word: SpellingWord, answer: string, correct: boolean, elapsedMs?: number) {
    const now = Date.now()
    const updated = applyAttempt(word, correct, now)

    const words = readLocal<SpellingWord>(WORDS_KEY)
    writeLocal(
      WORDS_KEY,
      words.map((w) => (w.id === word.id ? updated : w)),
    )

    const attempt: Attempt = {
      id: `a_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      wordId: word.id,
      word: word.word,
      answer,
      correct,
      createdAt: now,
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    }
    const attempts = readLocal<Attempt>(ATTEMPTS_KEY)
    attempts.unshift(attempt)
    writeLocal(ATTEMPTS_KEY, attempts.slice(0, MAX_LOCAL_ATTEMPTS))

    return updated
  }

  async listAttempts(limit = 100) {
    return readLocal<Attempt>(ATTEMPTS_KEY).slice(0, limit)
  }

  async clearAll() {
    writeLocal(WORDS_KEY, [])
    writeLocal(ATTEMPTS_KEY, [])
  }
}

/* --------------------------- firestore backend --------------------------- */

class FirestoreWordsRepository implements WordsRepository {
  readonly kind = 'firestore' as const

  private async ctx() {
    const fb = await getFirebase()
    if (!fb) throw new Error('Firebase is not configured.')
    const user = await ensureSignedIn()
    if (!user) throw new Error('Could not sign in to Firebase.')
    const fs = await import('firebase/firestore')
    return { db: fb.db, uid: user.uid, fs }
  }

  private wordsPath(uid: string) {
    return `users/${uid}/spellingWords`
  }

  async list(): Promise<SpellingWord[]> {
    const { db, uid, fs } = await this.ctx()
    const snap = await fs.getDocs(
      fs.query(fs.collection(db, this.wordsPath(uid)), fs.where('status', '==', 'active')),
    )
    return snap.docs.map((d) => ({ ...(d.data() as SpellingWord), id: d.id }))
  }

  async addMany(inputs: AddWordInput[]) {
    const { db, uid, fs } = await this.ctx()
    const now = Date.now()
    const added: SpellingWord[] = []
    const duplicates: string[] = []

    // De-duplicate within the batch first, so one scan cannot add "cat" twice.
    const unique = new Map<string, AddWordInput>()
    for (const input of inputs) {
      if (!input.word.trim()) continue
      const id = wordIdFor(input.word)
      if (!unique.has(id)) unique.set(id, input)
    }

    const batch = fs.writeBatch(db)
    for (const [id, input] of unique) {
      const ref = fs.doc(db, this.wordsPath(uid), id)
      const existing = await fs.getDoc(ref)
      if (existing.exists()) {
        duplicates.push(cleanWord(input.word))
        continue
      }
      const word = newWord(input, now)
      batch.set(ref, word)
      added.push(word)
    }
    if (added.length) await batch.commit()
    return { added, duplicates }
  }

  async update(id: string, patch: Partial<SpellingWord>) {
    const { db, uid, fs } = await this.ctx()
    await fs.updateDoc(fs.doc(db, this.wordsPath(uid), id), { ...patch, updatedAt: Date.now() })
  }

  async remove(id: string) {
    const { db, uid, fs } = await this.ctx()
    // Soft delete: the attempt history under this word stays meaningful, and a
    // word deleted by mistake can be restored. list() filters archived out.
    await fs.updateDoc(fs.doc(db, this.wordsPath(uid), id), { status: 'archived', updatedAt: Date.now() })
  }

  async recordAttempt(word: SpellingWord, answer: string, correct: boolean, elapsedMs?: number) {
    const { db, uid, fs } = await this.ctx()
    const now = Date.now()
    const wordRef = fs.doc(db, this.wordsPath(uid), word.id)

    const attempt: Omit<Attempt, 'id'> = {
      wordId: word.id,
      word: word.word,
      answer,
      correct,
      createdAt: now,
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    }
    await fs.addDoc(fs.collection(db, this.wordsPath(uid), word.id, 'attempts'), attempt)

    // increment() rather than a read-modify-write, so two devices practising the
    // same word at the same time both get counted.
    await fs.updateDoc(wordRef, {
      practiceCount: fs.increment(1),
      correctCount: fs.increment(correct ? 1 : 0),
      incorrectCount: fs.increment(correct ? 0 : 1),
      streak: correct ? fs.increment(1) : 0,
      lastPractisedAt: now,
      updatedAt: now,
    })

    return applyAttempt(word, correct, now)
  }

  async listAttempts(limit = 100): Promise<Attempt[]> {
    const { db, uid, fs } = await this.ctx()
    // collectionGroup keeps this one query regardless of how many words exist.
    const snap = await fs.getDocs(
      fs.query(
        fs.collectionGroup(db, 'attempts'),
        fs.where('__name__', '>=', `users/${uid}/spellingWords`),
        fs.orderBy('__name__'),
        fs.limit(limit * 4),
      ),
    )
    return snap.docs
      .map((d) => ({ ...(d.data() as Omit<Attempt, 'id'>), id: d.id }))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  }

  async clearAll() {
    const { db, uid, fs } = await this.ctx()
    const snap = await fs.getDocs(fs.collection(db, this.wordsPath(uid)))
    const batch = fs.writeBatch(db)
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

/* ------------------------------- selection ------------------------------- */

let cached: WordsRepository | null = null

/**
 * Picks the backend once. Firestore if configured and reachable, otherwise
 * local — and if Firestore sign-in fails at runtime we degrade to local rather
 * than leaving the child staring at an error.
 */
export async function getWordsRepository(): Promise<WordsRepository> {
  if (cached) return cached
  if (firebaseEnabled()) {
    try {
      await ensureSignedIn()
      cached = new FirestoreWordsRepository()
      return cached
    } catch (error) {
      console.warn('[words] Firebase unavailable, using on-device storage:', (error as Error).message)
    }
  }
  cached = new LocalWordsRepository()
  return cached
}

/** Test seam: lets unit tests exercise the local backend directly. */
export const __localRepository = LocalWordsRepository

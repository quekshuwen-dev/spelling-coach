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
 * Every word also carries a profileId (see profileService.ts): up to three
 * people can share one account, each with their own list, and every read here
 * is scoped to whoever is currently active.
 *
 * De-duplication is by `normalizedWord` PER PROFILE — the document id folds in
 * the profile id — which makes a duplicate impossible by construction rather
 * than by a read-then-write race, and lets two siblings each save "cat"
 * without colliding on one document.
 */
import { currentUser, firebaseEnabled, getFirebase } from '../lib/firebase'
import { cleanWord, detectLang, normalizeWord } from '../lib/words'
import { suggestFolder } from '../config/folders'
import { ensureActiveProfile, resetActiveProfileCache } from './profileService'
import type { Attempt, FolderId, SpellingWord, WordSource } from '../types'

export interface AddWordInput {
  word: string
  source: WordSource
  sourceImageId?: string
  /** Defaults to a guess from the word's language — see suggestFolder(). */
  folderId?: FolderId
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

function hashOf(normalized: string): string {
  let hash = 5381
  for (let i = 0; i < normalized.length; i++) hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0
  return `w${hash.toString(36)}${normalized.length}`
}

/**
 * A document id must be a safe, stable key, and unique per profile — two
 * profiles saving the same word must land on two different documents, or one
 * sibling's spelling list would silently absorb the other's.
 */
export function wordIdFor(word: string, profileId: string): string {
  const normalized = normalizeWord(word)
  const safe = normalized.replace(/[^a-z0-9'-]/g, '')
  const base = safe.length >= 2 && safe.length === normalized.length ? safe : hashOf(normalized)
  return `${profileId}_${base}`
}

function newWord(input: AddWordInput, now: number, profileId: string): SpellingWord {
  // Clean here, at the single boundary into storage, so no caller can save
  // "Beautiful," no matter which screen it came from.
  const word = cleanWord(input.word)
  const lang = detectLang(word)
  return {
    id: wordIdFor(word, profileId),
    word,
    normalizedWord: normalizeWord(word),
    lang,
    createdAt: now,
    updatedAt: now,
    source: input.source,
    ...(input.sourceImageId ? { sourceImageId: input.sourceImageId } : {}),
    status: 'active',
    practiceCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    streak: 0,
    profileId,
    folderId: input.folderId ?? suggestFolder(lang),
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

/**
 * Words saved before profiles existed have no profileId. Adopting them into
 * whichever profile is active the first time they are seen — rather than
 * requiring a separate migration screen — is what stops them from silently
 * disappearing the moment this code ships.
 */
function migrateLocalWords(defaultProfileId: string): void {
  const words = readLocal<SpellingWord>(WORDS_KEY)
  let changed = false
  const migrated = words.map((w) => {
    if (w.profileId) return w
    changed = true
    return { ...w, profileId: defaultProfileId, folderId: w.folderId ?? suggestFolder(w.lang) }
  })
  if (changed) writeLocal(WORDS_KEY, migrated)
}

class LocalWordsRepository implements WordsRepository {
  readonly kind = 'local' as const

  async list(): Promise<SpellingWord[]> {
    const profile = await ensureActiveProfile()
    migrateLocalWords(profile.id)
    return readLocal<SpellingWord>(WORDS_KEY).filter((w) => w.status !== 'archived' && w.profileId === profile.id)
  }

  async addMany(inputs: AddWordInput[]) {
    const profile = await ensureActiveProfile()
    const now = Date.now()
    const existing = readLocal<SpellingWord>(WORDS_KEY)
    const byId = new Map(existing.map((w) => [w.id, w]))
    const added: SpellingWord[] = []
    const duplicates: string[] = []

    for (const input of inputs) {
      if (!input.word.trim()) continue
      const candidate = newWord(input, now, profile.id)
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
      profileId: word.profileId,
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    }
    const attempts = readLocal<Attempt>(ATTEMPTS_KEY)
    attempts.unshift(attempt)
    writeLocal(ATTEMPTS_KEY, attempts.slice(0, MAX_LOCAL_ATTEMPTS))

    return updated
  }

  async listAttempts(limit = 100) {
    const profile = await ensureActiveProfile()
    return readLocal<Attempt>(ATTEMPTS_KEY)
      .filter((a) => a.profileId === profile.id)
      .slice(0, limit)
  }

  async clearAll() {
    const profile = await ensureActiveProfile()
    writeLocal(
      WORDS_KEY,
      readLocal<SpellingWord>(WORDS_KEY).filter((w) => w.profileId !== profile.id),
    )
    writeLocal(
      ATTEMPTS_KEY,
      readLocal<Attempt>(ATTEMPTS_KEY).filter((a) => a.profileId !== profile.id),
    )
  }
}

/**
 * Checks a specific profile without switching to it — used only to guard
 * profile deletion (see AppContext.removeProfile), so a parent cannot lose a
 * child's list by deleting the wrong profile by mistake.
 */
async function localProfileHasWords(profileId: string): Promise<boolean> {
  return readLocal<SpellingWord>(WORDS_KEY).some((w) => w.profileId === profileId && w.status !== 'archived')
}

/* --------------------------- firestore backend --------------------------- */

class FirestoreWordsRepository implements WordsRepository {
  readonly kind = 'firestore' as const

  private async ctx() {
    const fb = await getFirebase()
    if (!fb) throw new Error('Firebase is not configured.')
    const user = await currentUser()
    if (!user) throw new Error('Not signed in.')
    const fs = await import('firebase/firestore')
    return { db: fb.db, uid: user.uid, fs }
  }

  private wordsPath(uid: string) {
    return `users/${uid}/spellingWords`
  }

  async list(): Promise<SpellingWord[]> {
    const { db, uid, fs } = await this.ctx()
    const profile = await ensureActiveProfile()

    // Fetched unfiltered by profile and narrowed client-side, rather than a
    // where('profileId', ...) query, purely so the migration below (adopting
    // words saved before profiles existed) can run in the same round trip
    // instead of a second pass. Fine at the scale of one spelling list; would
    // need revisiting if this ever served hundreds of words across profiles.
    const snap = await fs.getDocs(
      fs.query(fs.collection(db, this.wordsPath(uid)), fs.where('status', '==', 'active')),
    )
    const all = snap.docs.map((d) => ({ ...(d.data() as SpellingWord), id: d.id }))

    const unclaimed = all.filter((w) => !w.profileId)
    if (unclaimed.length) {
      const batch = fs.writeBatch(db)
      for (const w of unclaimed) {
        const patch = { profileId: profile.id, folderId: w.folderId ?? suggestFolder(w.lang) }
        Object.assign(w, patch)
        batch.update(fs.doc(db, this.wordsPath(uid), w.id), patch)
      }
      await batch.commit()
    }

    return all.filter((w) => w.profileId === profile.id)
  }

  async addMany(inputs: AddWordInput[]) {
    const { db, uid, fs } = await this.ctx()
    const profile = await ensureActiveProfile()
    const now = Date.now()
    const added: SpellingWord[] = []
    const duplicates: string[] = []

    // De-duplicate within the batch first, so one scan cannot add "cat" twice.
    const unique = new Map<string, AddWordInput>()
    for (const input of inputs) {
      if (!input.word.trim()) continue
      const id = wordIdFor(input.word, profile.id)
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
      const word = newWord(input, now, profile.id)
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
      profileId: word.profileId,
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
    const profile = await ensureActiveProfile()
    // collectionGroup keeps this one query regardless of how many words exist.
    // The *4 buffer existed before profiles did; it now also has to cover
    // other profiles' attempts getting filtered out below, so a very active
    // multi-profile account could in rare cases see fewer than `limit` recent
    // attempts. Acceptable for a progress screen; would need a real profileId
    // filter in the query if this ever needs to be exact.
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
      .filter((a) => a.profileId === profile.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  }

  async clearAll() {
    const { db, uid, fs } = await this.ctx()
    const profile = await ensureActiveProfile()
    const snap = await fs.getDocs(
      fs.query(fs.collection(db, this.wordsPath(uid)), fs.where('profileId', '==', profile.id)),
    )
    const batch = fs.writeBatch(db)
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

/** Mirrors localProfileHasWords for the Firestore backend — see its comment. */
async function firestoreProfileHasWords(profileId: string): Promise<boolean> {
  const fb = await getFirebase()
  const user = await currentUser()
  if (!fb || !user) return false
  const fs = await import('firebase/firestore')
  const snap = await fs.getDocs(
    fs.query(
      fs.collection(fb.db, `users/${user.uid}/spellingWords`),
      fs.where('profileId', '==', profileId),
      fs.where('status', '==', 'active'),
      fs.limit(1),
    ),
  )
  return !snap.empty
}

/* ------------------------------- selection ------------------------------- */

let cached: WordsRepository | null = null

/**
 * Picks the backend. Firestore only when someone is actually signed in;
 * otherwise the device.
 *
 * Signing in is a deliberate act now that auth is Google rather than anonymous,
 * so being signed out is the normal case rather than a failure, and it must not
 * cost the child anything. If Firestore errors at runtime we still degrade to
 * local rather than leaving them staring at an error.
 */
export async function getWordsRepository(): Promise<WordsRepository> {
  if (cached) return cached
  if (firebaseEnabled()) {
    try {
      const user = await currentUser()
      if (user) {
        cached = new FirestoreWordsRepository()
        return cached
      }
    } catch (error) {
      console.warn('[words] Firebase unavailable, using on-device storage:', (error as Error).message)
    }
  }
  cached = new LocalWordsRepository()
  return cached
}

/** Re-pick the backend after a sign-in, sign-out, or profile switch. */
export function resetWordsRepository(): void {
  cached = null
}

/**
 * Does this profile have any words? Used only to block deleting a profile
 * that still has a spelling list on it — see AppContext.removeProfile.
 */
export async function profileHasWords(profileId: string): Promise<boolean> {
  const repo = await getWordsRepository()
  return repo.kind === 'firestore' ? firestoreProfileHasWords(profileId) : localProfileHasWords(profileId)
}

/**
 * Copy device-stored words into the signed-in account.
 *
 * Without this, signing in swaps an empty Firestore in behind a child who
 * already had words, and it reads as data loss. The local copy is deliberately
 * left alone: if the upload half-fails, the words are still somewhere.
 *
 * Reads localStorage directly rather than through LocalWordsRepository.list():
 * by the time this runs, sign-in has already completed, so list()'s own
 * profile lookup would resolve to the just-signed-into account's profile —
 * exactly the target we want words tagged with, but the wrong place to read
 * the SOURCE words from, which are whatever this device had saved regardless
 * of which profile was active before sign-in.
 */
export async function uploadLocalWords(): Promise<{ added: number; duplicates: number }> {
  const words = readLocal<SpellingWord>(WORDS_KEY).filter((w) => w.status !== 'archived')
  if (!words.length) return { added: 0, duplicates: 0 }

  const remote = new FirestoreWordsRepository()
  const { added, duplicates } = await remote.addMany(
    words.map((w) => ({ word: w.word, source: w.source, sourceImageId: w.sourceImageId, folderId: w.folderId })),
  )
  return { added: added.length, duplicates: duplicates.length }
}

/** How many words are sitting on this device, for "sync these?" prompts. */
export async function countLocalWords(): Promise<number> {
  return readLocal<SpellingWord>(WORDS_KEY).filter((w) => w.status !== 'archived').length
}

/** Test seam: lets unit tests exercise the local backend directly. */
export const __localRepository = LocalWordsRepository

// Re-exported so callers that already import from wordsRepository (the
// module screens actually use) do not also need a direct profileService
// import just to clear its cache alongside this one.
export { resetActiveProfileCache }

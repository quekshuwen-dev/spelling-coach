/**
 * Profiles — "who is practising" — up to three people sharing one device or
 * account, each with their own word list.
 *
 * Profile RECORDS (the roster of names) follow the same storage split as
 * words: Firestore when someone is signed in, so every device shows the same
 * names, and the device otherwise. Which profile is ACTIVE right now is a
 * different kind of state: a family sharing one account still wants to pick a
 * different child on each device, the way a shared streaming account works.
 * So the active pick always lives in localStorage, never in the account.
 */
import { currentUser, firebaseEnabled, getFirebase } from '../lib/firebase'
import type { Profile } from '../types'

export const MAX_PROFILES = 3

const ACTIVE_KEY = 'sc2_active_profile'
const LOCAL_PROFILES_KEY = 'sc2_profiles'

export const PROFILE_EMOJI = ['🦊', '🐱', '🐶', '🐰', '🦁', '🐼', '🐨', '🐸']

function readLocalProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILES_KEY)
    return raw ? (JSON.parse(raw) as Profile[]) : []
  } catch {
    return []
  }
}

function writeLocalProfiles(list: Profile[]): void {
  try {
    localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(list))
  } catch {
    /* profiles are a convenience; failing to persist them is not fatal */
  }
}

function newProfileId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

async function usingFirestore(): Promise<boolean> {
  if (!firebaseEnabled()) return false
  try {
    return Boolean(await currentUser())
  } catch {
    return false
  }
}

async function firestoreCtx() {
  const fb = await getFirebase()
  const user = await currentUser()
  if (!fb || !user) throw new Error('Not signed in.')
  const fs = await import('firebase/firestore')
  return { db: fb.db, uid: user.uid, fs }
}

function profilesPath(uid: string) {
  return `users/${uid}/profiles`
}

export async function listProfiles(): Promise<Profile[]> {
  if (await usingFirestore()) {
    const { db, uid, fs } = await firestoreCtx()
    const snap = await fs.getDocs(fs.collection(db, profilesPath(uid)))
    return snap.docs.map((d) => d.data() as Profile).sort((a, b) => a.createdAt - b.createdAt)
  }
  return readLocalProfiles().sort((a, b) => a.createdAt - b.createdAt)
}

export async function createProfile(name: string, emoji?: string): Promise<Profile> {
  const existing = await listProfiles()
  if (existing.length >= MAX_PROFILES) {
    throw new Error(`Only ${MAX_PROFILES} profiles are allowed.`)
  }
  const profile: Profile = {
    id: newProfileId(),
    name: name.trim() || 'New profile',
    emoji: emoji ?? PROFILE_EMOJI[existing.length % PROFILE_EMOJI.length],
    createdAt: Date.now(),
  }
  if (await usingFirestore()) {
    const { db, uid, fs } = await firestoreCtx()
    await fs.setDoc(fs.doc(db, profilesPath(uid), profile.id), profile)
  } else {
    writeLocalProfiles([...existing, profile])
  }
  activeProfileCache = null
  return profile
}

export async function renameProfile(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  if (await usingFirestore()) {
    const { db, uid, fs } = await firestoreCtx()
    await fs.updateDoc(fs.doc(db, profilesPath(uid), id), { name: trimmed })
  } else {
    writeLocalProfiles(readLocalProfiles().map((p) => (p.id === id ? { ...p, name: trimmed } : p)))
  }
  if (activeProfileCache?.id === id) activeProfileCache = { ...activeProfileCache, name: trimmed }
}

export async function deleteProfile(id: string): Promise<void> {
  if (await usingFirestore()) {
    const { db, uid, fs } = await firestoreCtx()
    await fs.deleteDoc(fs.doc(db, profilesPath(uid), id))
  } else {
    writeLocalProfiles(readLocalProfiles().filter((p) => p.id !== id))
  }
  if (activeProfileCache?.id === id) activeProfileCache = null
}

export function getActiveProfileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function setActiveProfileId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    /* the pick is a convenience; the app still works without it persisting */
  }
}

/**
 * Cached so that every word-list operation (list, addMany, recordAttempt...)
 * can cheaply ask "whose words are these" without a Firestore round trip each
 * time. Cleared on sign-in, sign-out, and any profile switch or edit — see the
 * reset* exports below, mirrored by wordsRepository's own repository cache.
 */
let activeProfileCache: Profile | null = null

export function resetActiveProfileCache(): void {
  activeProfileCache = null
}

/**
 * Guarantees at least one profile exists and one is active, creating a
 * default the first time this runs. This is also the seam that lets
 * wordsRepository migrate words saved before profiles existed onto that
 * default profile, rather than the app needing a separate migration step.
 */
export async function ensureActiveProfile(fallbackName = 'My words'): Promise<Profile> {
  if (activeProfileCache) return activeProfileCache

  let profiles = await listProfiles()
  if (profiles.length === 0) {
    const created = await createProfile(fallbackName, PROFILE_EMOJI[0])
    profiles = [created]
  }

  const activeId = getActiveProfileId()
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0]
  setActiveProfileId(active.id)
  activeProfileCache = active
  return active
}

/** Switch who is practising. The caller is responsible for reloading words. */
export async function switchActiveProfile(id: string): Promise<Profile> {
  const profiles = await listProfiles()
  const next = profiles.find((p) => p.id === id)
  if (!next) throw new Error('That profile no longer exists.')
  setActiveProfileId(next.id)
  activeProfileCache = next
  return next
}

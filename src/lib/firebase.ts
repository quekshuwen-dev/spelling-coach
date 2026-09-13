/**
 * Firebase bootstrap and Google sign-in.
 *
 * Everything here is lazy: with no config in .env the SDK is never imported at
 * all, so the app runs — and the bundle stays small — with zero credentials.
 *
 * The auth model is deliberately "signed out is a normal state". Google sign-in
 * needs a user gesture, so unlike the anonymous sign-in this replaced, it cannot
 * happen silently at startup. A child who has not signed in keeps every feature
 * and their words are stored on the device; signing in is an upgrade that syncs
 * them across devices, never a gate in front of practising.
 */
import { firebaseConfig, isFirebaseConfigured } from '../config/env'
import type { FirebaseApp } from 'firebase/app'
import type { Auth, User } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

let appPromise: Promise<{ app: FirebaseApp; auth: Auth; db: Firestore } | null> | null = null

export function firebaseEnabled(): boolean {
  return isFirebaseConfigured
}

export function getFirebase() {
  if (!isFirebaseConfigured) return Promise.resolve(null)
  if (appPromise) return appPromise

  appPromise = (async () => {
    const [{ initializeApp, getApps, getApp }, { getAuth }, { getFirestore }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ])
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
    return { app, auth: getAuth(app), db: getFirestore(app) }
  })()

  return appPromise
}

/**
 * Who is signed in, once Firebase has restored any saved session.
 *
 * `auth.currentUser` is null for a moment on every page load even when the user
 * is signed in, so waiting for the first auth callback is the only way to tell
 * "signed out" apart from "not checked yet" — and getting that wrong sends a
 * returning user to device-only storage and their synced words look lost.
 */
export async function currentUser(): Promise<User | null> {
  const fb = await getFirebase()
  if (!fb) return null
  const { onAuthStateChanged, getRedirectResult } = await import('firebase/auth')

  // Completes a redirect sign-in that started before the page reloaded.
  try {
    const redirect = await getRedirectResult(fb.auth)
    if (redirect?.user) return redirect.user
  } catch {
    /* no redirect pending, or it failed — fall through to the saved session */
  }

  return new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(
      fb.auth,
      (user) => {
        unsubscribe()
        resolve(user)
      },
      () => {
        unsubscribe()
        resolve(null)
      },
    )
  })
}

/** Subscribe to sign-in and sign-out. Returns an unsubscribe function. */
export async function watchAuth(onChange: (user: User | null) => void): Promise<() => void> {
  const fb = await getFirebase()
  if (!fb) return () => {}
  const { onAuthStateChanged } = await import('firebase/auth')
  return onAuthStateChanged(fb.auth, onChange)
}

export class SignInError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'SignInError'
  }
}

/** Errors that mean "the user changed their mind", not "something broke". */
const CANCELLED = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
])

/** Errors where a popup cannot work here, but a full-page redirect can. */
const NEEDS_REDIRECT = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
])

/**
 * Sign in with Google. Must be called from a user gesture, or the browser
 * blocks the popup.
 *
 * Resolves to null when the user closes the popup, which is a normal outcome
 * and must not surface as an error. When a popup cannot open at all — some
 * in-app browsers, and installed PWAs on older iOS — this falls back to a
 * full-page redirect, and the promise never resolves because the page goes away.
 */
export async function signInWithGoogle(): Promise<User | null> {
  const fb = await getFirebase()
  if (!fb) throw new SignInError('not-configured', 'Firebase is not configured.')

  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth')
  const provider = new GoogleAuthProvider()
  // Always ask which account, so a shared family device is not stuck on one.
  provider.setCustomParameters({ prompt: 'select_account' })

  try {
    const result = await signInWithPopup(fb.auth, provider)
    return result.user
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'unknown'
    if (CANCELLED.has(code)) return null
    if (NEEDS_REDIRECT.has(code)) {
      await signInWithRedirect(fb.auth, provider)
      return null
    }
    if (code === 'auth/network-request-failed') {
      throw new SignInError(code, 'Could not reach Google. Check your connection and try again.')
    }
    if (code === 'auth/unauthorized-domain') {
      throw new SignInError(
        code,
        'This web address is not allowed to sign in. Add it under Authentication → Settings → Authorized domains.',
      )
    }
    throw new SignInError(code, 'Could not sign in with Google.')
  }
}

export async function signOutUser(): Promise<void> {
  const fb = await getFirebase()
  if (!fb) return
  const { signOut } = await import('firebase/auth')
  await signOut(fb.auth)
}

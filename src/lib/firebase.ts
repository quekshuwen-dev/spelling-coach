/**
 * Firebase bootstrap.
 *
 * Everything here is lazy: if no config is present in .env the module never
 * imports the SDK at all, so the app runs (and the bundle stays small) with
 * zero credentials. See README "YOU NEED TO CONFIGURE THIS".
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
 * MVP authentication: anonymous sign-in.
 *
 * It gives every device a stable uid so Firestore rules can scope data to
 * users/{uid}, with no password for a child to forget. Upgrading to a real
 * account later is `linkWithCredential` on the same uid, so no data migration.
 */
export async function ensureSignedIn(): Promise<User | null> {
  const fb = await getFirebase()
  if (!fb) return null
  const { signInAnonymously, onAuthStateChanged } = await import('firebase/auth')

  if (fb.auth.currentUser) return fb.auth.currentUser
  return new Promise<User | null>((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      fb.auth,
      (user) => {
        if (user) {
          unsubscribe()
          resolve(user)
        }
      },
      (error) => {
        unsubscribe()
        reject(error)
      },
    )
    signInAnonymously(fb.auth).catch((error) => {
      unsubscribe()
      reject(error)
    })
  })
}

/**
 * Client-side configuration.
 *
 * Only values that are safe in a browser live here. The OCR provider key is
 * NEVER read on the client — it stays on the server (see server/ocrHandler.ts).
 */
const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
}

/** True once a real Firebase web config is present in .env. */
export const isFirebaseConfigured =
  Boolean(firebaseConfig.apiKey) && Boolean(firebaseConfig.projectId) && Boolean(firebaseConfig.appId)

/** Skip the server OCR endpoint and always use the in-browser engine. */
export const forceLocalOcr = env.VITE_FORCE_LOCAL_OCR === 'true'

export const appConfig = {
  name: 'Spelling Coach',
  tagline: 'Scan a list. Pick the words. Practise by ear.',
  /** Max edge length before upload — smaller images OCR faster and cost less. */
  maxImageEdge: 1600,
  imageQuality: 0.85,
}

# Deploying Spelling Coach

Everything that can be prepared in advance already is. What is left needs you to
sign in once, because creating a project is an act only the account owner can
take — no token exists in the repo, and none can be generated for you.

The app is built to run with **no credentials at all**: on-device OCR, on-device
storage, on-device voice. So the first deploy below gives a fully working app.
Firestore and server OCR are optional extras, covered at the end.

---

## Firebase Hosting

The project is **already configured**: `.firebaserc` points at
`spelling-coach-61d31` and `.env.production` carries its web config, so there is
nothing to fill in.

```bash
git clone https://github.com/quekshuwen-dev/spelling-coach
cd spelling-coach
git checkout claude/beautiful-ride-hi7n1q
npm install

npx firebase-tools login                    # opens a browser once
npx firebase-tools deploy --only hosting,firestore:rules
```

`firebase.json` has a `predeploy` hook, so `deploy` builds the app first — there
is no separate `npm run build` step.

Your app lands at **<https://spelling-coach-61d31.web.app>**.

### Console settings

Google sign-in and the Firestore database are **already enabled** on this
project. Deploying with `firestore:rules` above installs the rules that confine
each user to their own subtree — do that rather than leaving the database in test
mode, which is open to anyone.

One thing to check after the first deploy: **Authentication → Settings →
Authorized domains** must list the domain you are serving from.
`spelling-coach-61d31.web.app` and `.firebaseapp.com` are there by default, so
this only matters if you add a custom domain or deploy to Vercel as well. Signing
in from a domain that is not listed fails with `auth/unauthorized-domain`, and
the app reports that as "This web address is not allowed to sign in".

### Signing in is optional

The app works fully signed out — every feature, words stored on the device. The
sign-in button lives in **Settings → Sync across devices**, and signing in
uploads whatever is already on the device so nothing appears to vanish behind a
suddenly-empty account.

This differs from the anonymous sign-in the app originally used. Anonymous auth
signed everyone in silently at startup; Google sign-in needs a deliberate tap, so
"signed out" is a normal, fully-supported state rather than a failure.

### Updating later

```bash
git pull
npx firebase-tools deploy --only hosting
```

---

## Vercel — fewer steps, no CLI

1. Go to <https://vercel.com/new>
2. Sign in with GitHub
3. Import `quekshuwen-dev/spelling-coach`
4. **Change the branch to `claude/beautiful-ride-hi7n1q`.** Left on `main` you
   will deploy the old single-file app and see none of the new work.
5. Deploy

Vercel detects Vite on its own. It also runs the `/api/*` endpoints as
serverless functions, which Firebase Hosting alone cannot — see below.

---

## Installing it on a phone

Once deployed, open the URL on the phone:

- **Android / Chrome** — the install banner, or ⋮ → *Add to home screen*
- **iOS / Safari** — Share → *Add to Home Screen*

It then launches fullscreen from the orange Spelling Coach icon, and works
offline.

---

## Optional extras

Neither is needed for the app to work.

### Syncing words across devices (Firestore)

Already wired up in `.env.production`. It starts working once Anonymous auth and
the Firestore database are switched on, as above. Until then words are stored in
the browser on one device.

The config values in that file are public by design: Vite inlines them into the
bundle, so they are served to every visitor regardless. Firebase documents the
apiKey as an identifier, not a secret — `firestore.rules` is what protects the
data. Redeploy the rules whenever they change:

```bash
npx firebase-tools deploy --only firestore:rules
```

### Better OCR for handwriting

The app reads printed lists on-device with Tesseract, needing no key. Handwriting
is genuinely hard for it. A server OCR provider reads handwriting far better, and
the key stays on the server rather than in the browser.

This needs somewhere to run `/api/ocr`:

- **On Vercel** — it works as-is. Set `OCR_PROVIDER` and the matching API key in
  the project's environment variables.
- **On Firebase Hosting** — Hosting serves static files only, so `/api/*` needs
  Cloud Functions, which requires the paid Blaze plan. Without it the app quietly
  falls back to on-device OCR, which is the intended behaviour, not an error.

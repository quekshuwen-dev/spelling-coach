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

### Two settings to turn on in the console, once

Both are in the [Firebase console](https://console.firebase.google.com/project/spelling-coach-61d31):

1. **Authentication → Sign-in method → Anonymous → Enable.** The app signs every
   child in anonymously so their words are theirs. Without this, saving to
   Firestore fails and the app silently falls back to device-only storage.
2. **Firestore Database → Create database.** Pick a region near you. Deploying
   with `firestore:rules` above then installs the rules that confine each user to
   their own subtree — do not leave it in test mode, which is open to anyone.

Until both are done the app still works: it stores words on the device instead.

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

# Deploying Spelling Coach

Everything that can be prepared in advance already is. What is left needs you to
sign in once, because creating a project is an act only the account owner can
take — no token exists in the repo, and none can be generated for you.

The app is built to run with **no credentials at all**: on-device OCR, on-device
storage, on-device voice. So the first deploy below gives a fully working app.
Firestore and server OCR are optional extras, covered at the end.

---

## Firebase Hosting

Run these on your own machine, from the project root:

```bash
git clone https://github.com/quekshuwen-dev/spelling-coach
cd spelling-coach
git checkout claude/beautiful-ride-hi7n1q
npm install

npx firebase-tools login                               # opens a browser once
npx firebase-tools projects:create spelling-coach-app  # pick any unused id
npx firebase-tools use spelling-coach-app
npx firebase-tools deploy --only hosting
```

`firebase.json` has a `predeploy` hook, so `deploy` builds the app first — there
is no separate `npm run build` step.

Your app lands at `https://<project-id>.web.app`.

> Firebase needs a **Google** account. If the one you use day to day is not a
> Google account, sign in with whichever Google account you want the project to
> live under.

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

Without this, words are stored in the browser on one device. To sync, create a
`.env` from `.env.example` and fill in the web app config from
**Firebase console → Project settings → Your apps**:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
```

These values are safe in the browser — `firestore.rules` is what protects the
data, and it confines every user to their own subtree. Deploy the rules too:

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

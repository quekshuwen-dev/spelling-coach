# Deploying Spelling Coach

Everything that can be prepared in advance already is. What is left needs you to
sign in once, because creating a project is an act only the account owner can
take — no token exists in the repo, and none can be generated for you.

The app is built to run with **no credentials at all**: on-device OCR, on-device
storage, on-device voice. So the first deploy below gives a fully working app.
Firestore and server OCR are optional extras, covered at the end.

---

## Automatic deploys (recommended)

`.github/workflows/deploy.yml` typechecks, tests and deploys on every push to
`main` or the working branch, and from the Actions tab on demand. Set it up once
and you never touch a CLI again.

It needs **one repository secret**.

### 1. Create a service account key

[Firebase console → Project settings → Service
accounts](https://console.firebase.google.com/project/spelling-coach-61d31/settings/serviceaccounts/adminsdk)
→ **Generate new private key**. A `.json` file downloads.

> ⚠️ **This file is a real secret.** Unlike the web config in `.env.production`,
> which is public by design, this key grants full access to the project. Put it
> only in the GitHub secret below. Never commit it, and never paste it into a
> chat or an issue. If it leaks, revoke it on that same console page.

### 2. Put it in GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**

- Name: `FIREBASE_SERVICE_ACCOUNT`
- Value: the entire contents of the downloaded `.json`, pasted as-is

### 3. Push

That is it. Watch it under the repo's **Actions** tab; the run summary links to
the live site.

### If the Firestore rules step fails

Hosting and the rules need different permissions, and the default key from step 1
carries only enough to deploy the app itself. Deploying the app never blocks on
this — the workflow treats the rules step as best-effort and turns the failure
into a `::warning::` on the run, precisely so a missing IAM role does not also
keep the app itself offline.

But **do not ignore that warning**. The rules in `firestore.rules` — the ones
that confine each user to their own data — are not the ones protecting your
database until this deploys at least once. Whatever you set up when you
created the database in the console is what is actually in force. If that was
"test mode," the database is open to anyone who finds the project id.

Fix it once: [Cloud IAM
console](https://console.cloud.google.com/iam-admin/iam?project=spelling-coach-61d31)
→ find the account ending `@spelling-coach-61d31.iam.gserviceaccount.com` → **Edit
principal** → **Add another role** → **Service Usage Consumer**. Re-run the
workflow from the Actions tab afterwards (no need to push again).

If hosting itself fails instead, the account is missing **Firebase Hosting
Admin**, added the same way.

---

## Deploying by hand

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

## Not using Vercel

Firebase Hosting is the only target for this app. Vercel was connected to the
repository at one point and built it automatically; that has been disconnected.

Removing `vercel.json` from the repository is not on its own enough to stop it —
Vercel builds through a GitHub App integration, so it keeps deploying whatever
the repo contains. Turning it off is done in the Vercel dashboard: the project's
**Settings → Git → Disconnect**, or **Settings → Advanced → Delete Project**.

The `/api/*` handlers are still in the repository. They are inert on Firebase
Hosting, which serves static files only, and the app falls back to on-device OCR
as designed. They are kept because they are the server-OCR implementation and
would be the starting point for a Cloud Function — see the OCR note at the end.

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

This needs somewhere to run `/api/ocr`, and Firebase Hosting serves static files
only. So it needs a Cloud Function, which means the paid Blaze plan.

**Without it nothing is broken.** The app probes `/api/config`, gets no answer,
and uses the on-device reader — the intended behaviour, not an error. Printed
spelling lists, which is what this app is for, read well that way.

To add it later: `server/ocrHandler.ts` holds the provider logic and is already
independent of any host. `api/ocr.ts` and `api/config.ts` are thin adapters, and
a Cloud Function would be a third one alongside them. Set `OCR_PROVIDER` and the
matching key in the function's environment — never with a `VITE_` prefix, or the
key lands in the browser bundle.

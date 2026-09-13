# Spelling Coach

Photograph a spelling list → pick the words → practise spelling by ear.

Built for primary-school children and the parent sitting next to them. Installable
as a PWA, works offline, and runs end-to-end **with no credentials at all**.

```
IMAGE → OCR → SELECT WORDS → SPELLING LIST → START TEST → HEAR WORD
      → TYPE ANSWER → CHECK → RESULT → SAVE ATTEMPT → NEXT WORD
```

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

That is the whole setup. With nothing configured the app uses the **in-browser
OCR engine** and saves words **on the device**. Every screen and the complete
journey above work in that state — nothing is stubbed or faked.

```bash
npm test             # 59 unit tests
npm run typecheck    # tsc, strict
npm run build        # production build + service worker
```

---

## Architecture, and why

| Decision | Choice | Why |
| --- | --- | --- |
| Framework | **Vite + React + TypeScript** | A static build, which is all Firebase Hosting serves, and a clean PWA story. Next.js's SSR buys nothing for an offline-first app a child opens from their home screen. It also matches the `calories` app, so the two projects share a shape. |
| Styling | **Tailwind** | As requested. A small set of component classes (`.btn-primary`, `.card`) in `src/index.css` keeps the screens readable instead of a wall of utilities. |
| Database | **Firestore**, with a localStorage fallback | Both sit behind one `WordsRepository` interface, so no screen knows which is in use. |
| Auth | **Google sign-in, and optional** | Gives a stable `uid` for the security rules and syncs words across devices. Unlike the anonymous auth this replaced, it needs a deliberate tap — so *signed out* is a fully supported state, words are stored on the device, and nothing is gated behind an account. Signing in uploads what is already on the device. |
| OCR | **Serverless vision model, falling back to Tesseract.js** | See below. |
| Speech | **Web Speech API**, wrapped | See below. |

### Module map

```
api/                    Serverless adapters over server/ocrHandler.ts
server/ocrHandler.ts     The ONLY place an OCR key is used
server/viteDevApi.ts     Serves /api/* in dev with the same handler code
src/config/scoring.ts    Every progress threshold, in one file
src/lib/words.ts         Pure word cleaning / matching (heavily unit-tested)
src/services/
  speechService.ts       Text-to-speech, with the workarounds documented below
  ocrService.ts          Picks an engine, normalises the output
  imageProcessingService.ts  Downscale + darkness check (ported from `calories`)
  wordsRepository.ts     Firestore and local backends behind one interface
  practiceSelection.ts   Weighted, priority-based word selection
src/components/
  CameraCapture.tsx      The camera flow from the `calories` app
  WordPicker.tsx         Selectable / editable OCR words
src/screens/             Home, Scan, WordList, Test, Progress, Settings
```

---

## The sound

**A real neural voice comes first.** The fixes below make the device's own
voices as good as they can be, and that still is not good enough: they are
synthetic enough that a child mishears the word they are being asked to spell.
So the word is fetched as real neural audio (Amazon Polly, via StreamElements'
free endpoint) and played as an `<audio>` clip — the same approach as the
reading helper — with everything below as the fallback. See
`src/services/neuralVoice.ts`.

Two details carry most of the difference:

- **`preservesPitch`.** "Say it slowly" plays at 0.6×. Without this the pitch
  falls with the speed and the voice becomes a growl. This alone is most of why
  slowed-down speech used to sound wrong.
- **Caching.** A child hears the same ten words many times, so each clip is
  fetched once, and the service worker keeps it — a word heard once can still be
  heard offline.

The fallback is automatic and total: if the service is unreachable, the network
is down, or the response is not audio, the word is spoken by the device voice
instead, and the app stops asking for the rest of the session rather than making
every word wait for a timeout. Letter-by-letter spelling deliberately stays on
the device voice — a neural voice applies word-level pronunciation rules, so a
lone "a" comes back as "uh" rather than the letter name.

Each word is sent to the voice service to be read aloud. **Settings → Natural
voice** turns this off, which keeps every word on the device.

The rest of this section is the fallback path. The original app called the Web
Speech API the naive way, which sounds wrong on real devices for reasons that
are not obvious. Each one is fixed in `src/services/speechService.ts` and pinned
by a test in `src/test/speech.test.ts`.

| # | What was wrong | What it sounded like | Fix |
| --- | --- | --- | --- |
| 1 | `getVoices()` was called synchronously | On Chrome the first call returns `[]`, so **no voice was set at all** and Chinese text was read by the default English voice — gibberish | `loadVoices()` awaits the `voiceschanged` event, with a 2 s timeout for Android builds that never fire it |
| 2 | Pinyin was sent to a Mandarin voice | `shuǐ` is Latin text; the engine read the letters, not the word | `resolveUtterance()` converts pinyin → 水 via a reverse index, and **refuses to speak** a syllable it cannot resolve rather than making noise |
| 3 | `rate = 0.7` everywhere | Slurred, not slow-and-clear | Default 0.9; an explicit **🐢 Say it slowly** button at 0.6 during a test |
| 4 | Voice matched by name (`/samantha|karen|zira/`) | On Android none matched, so it fell through to the system default — which on macOS can be a novelty voice ("Zarvox", "Bad News") | Scored selection with a novelty denylist and an accent fallback chain |
| 5 | Hard-coded `en-US` | A Singapore child heard an American voice | Accent is a setting: **en-SG → en-GB → en-AU → en-US**, defaulting to Singapore |
| 6 | `cancel()` then `speak()` in the same tick | Chrome silently drops the new utterance | Cancel, yield 120 ms, then speak |
| 7 | Word spoken, then `cancel()` 600 ms later to read the definition | **The word was chopped in half** | One serial queue; `speak()` resolves when the utterance actually ends |
| 8 | Long utterances | Desktop Chrome stops after ~15 s | A `resume()` heartbeat while speaking |
| 9 | iOS | Safari refuses speech not started by a user gesture | Unlocked on the first tap anywhere (`src/main.tsx`) |
| 10 | No voice installed for a language | Silence, with no explanation | `hasVoiceFor()` — the test screen says so, and Settings shows **which voice will actually be used** |

Settings → Voice lets the parent hear each accent and speed before choosing.

---

## OCR: the options, and the recommendation

| Option | Accuracy on kids' worksheets | Cost | Setup | Security | Browser |
| --- | --- | --- | --- | --- | --- |
| **Tesseract.js** | Good on clean print; **poor on handwriting** and on photos taken at an angle | Free | None | Nothing leaves the device | ~3 MB wasm download once |
| **Google Cloud Vision** | Very good, including handwriting | ~$1.50 / 1000 images | GCP project, billing, service account | Needs a backend | Any |
| **LLM vision (Claude / GPT-4o)** | Very good, and it segments the words and drops headers/page numbers in the same call | ~$0.003 / image | One env var | Needs a backend | Any |

**Recommendation, and what is implemented: LLM vision as the primary engine,
Tesseract.js as a zero-config fallback.**

The deciding factor is that an LLM returns *the spelling words* rather than
*all the text on the page* — it drops the child's name, the date, the teacher's
instructions and the page number, which is most of the cleanup work. Tesseract
as the fallback means the app has no hard dependency on a key, works offline,
and costs nothing for a parent who never configures anything.

All three are supported; switch with one environment variable. **No key is ever
in browser code** — `server/ocrHandler.ts` is the only module that reads one.

---

## YOU NEED TO CONFIGURE THIS

Everything below is **optional**. Copy `.env.example` to `.env` and fill in a
section to enable it.

### 1. Firebase — to sync words across devices

Without this, words are saved on the device only.

1. Create a project at <https://console.firebase.google.com>.
2. **Build → Firestore Database → Create database** (production mode).
3. **Build → Authentication → Sign-in method → Anonymous → Enable.**
4. **Project settings → Your apps → Web app**, and copy the config into `.env`:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

These six values are **public by design** — they identify the project, they do
not authorise anything. Your data is protected by `firestore.rules`.

5. Deploy the rules (this step is not optional if you enable Firebase):

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

### 2. OCR provider — for best-quality scanning

Without this, scanning uses the in-browser engine.

**Server-side variables. Never prefix them with `VITE_`** — that would put your
key in the browser bundle.

```
OCR_PROVIDER=anthropic        # or: openai | google-vision | none
OCR_MODEL=claude-sonnet-5     # optional; a sensible default per provider
OCR_API_KEY=sk-...
```

Locally they go in `.env` (git-ignored) and are read by the dev API middleware.
The Firebase web config lives in `.env.production`, which is committed because
Vite inlines it into the bundle and it is public by design.

---

## Firestore shape

```
users/{userId}
users/{userId}/spellingWords/{wordId}
users/{userId}/spellingWords/{wordId}/attempts/{attemptId}
```

```ts
// spellingWords/{wordId}   — the document id IS the normalised word
{
  word: "Beautiful",          // as the user wants to see it
  normalizedWord: "beautiful",// de-duplication key
  lang: "en",                 // en | zh | py
  createdAt: 1757635200000,
  updatedAt: 1757635200000,
  source: "image",            // image | manual | voice | sample
  sourceImageId: "img_m1x2…", // traces a word back to the scan it came from
  status: "active",           // active | archived (delete is a soft delete)
  practiceCount: 5,
  correctCount: 4,
  incorrectCount: 1,
  streak: 2,                  // consecutive correct — what mastery measures
  lastPractisedAt: 1757638800000
}

// …/attempts/{attemptId}     — append-only; the rules forbid update and delete
{ wordId, word, answer, correct, createdAt, elapsedMs }
```

**Why the document id is the normalised word:** duplicates become impossible by
construction rather than by a read-then-write check. Two devices adding
"beautiful" at the same moment converge on one document, and `practiceCount`
keeps counting. Statistics are updated with `increment()` for the same reason.

---

## Progress thresholds

Every threshold lives in **`src/config/scoring.ts`** and nowhere else.

```ts
accuracy: { learning: 0.7, good: 0.9, mastered: 1.0 }
masteryStreak: 3          // perfect accuracy alone is not mastery
defaultSessionSize: 10
```

| Accuracy | Status |
| --- | --- |
| never practised | 🌱 Not tried yet |
| < 70% | 💪 Needs practice |
| 70–89% | 📘 Learning |
| 90–99% | 👍 Good |
| 100% **and** 3 in a row | 🏆 Mastered |

### Smart practice

`src/services/practiceSelection.ts` gives each word a 0–1 priority, then draws a
session by weighted random selection without replacement:

- frequently incorrect → **higher** priority
- never practised → **high** priority
- not seen for a week → drifts **up**
- mastered → sinks, but to a **floor, not to zero**, so it still comes round

That floor is the difference between spaced practice and only ever drilling the
hard words. It is unit-tested (`src/test/practice.test.ts`).

---

## Anti-cheating

While the child is answering, the target word is **never rendered into the DOM**
— not blurred, not hidden with CSS, not in a `title`. It cannot be found with
Inspect Element, by selecting the page, or by a screen reader.

`autoComplete`, `autoCorrect`, `autoCapitalize` and `spellCheck` are all off on
the answer box, or a phone keyboard would spell the word for them. Toasts are
cleared when a question appears, since one could otherwise still be showing
`✅ "garden" added`.

There is an explicit **🙈 I cannot hear it — show me the word** escape hatch, so
a child with no working voice is never stuck.

---

## Deploying

Firebase Hosting, at `spelling-coach-61d31`. Pushing deploys it: see
[DEPLOY.md](DEPLOY.md) for the CI workflow and the one secret it needs.

The app is a PWA — "Add to Home Screen" on iOS or "Install" on Android gives a
full-screen app with an icon, and it keeps working offline.

---

## Deliberately not built yet

Structured for, but not implemented — each has a seam ready:

- AI example sentences, definitions, phonics and syllable breakdown
  (`SpellingWord.notes` and the `/api` pattern are the hooks)
- Multiple children — today the app is single-profile; the Firestore path is
  already `users/{userId}/…`, so a second level slots in without a migration
- Parent dashboard and weekly reports (the `attempts` subcollection is the data)
- Adaptive difficulty beyond the priority score in `scoring.ts`

## Known limits

- Tesseract needs one online visit to download its engine before it works offline.
- Handwriting is genuinely hard for the on-device engine — configure an OCR
  provider if the lists are handwritten.
- The natural voice needs the internet the first time it says a given word.
  Offline, and with the setting off, quality drops to whatever voices the device
  has installed; Settings shows which one will be used and warns when a language
  has none.

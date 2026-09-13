/**
 * Voice settings.
 *
 * This screen exists because "the sound is wrong" is almost always a device
 * problem (no matching voice installed, a novelty voice as default, the wrong
 * accent) and the only honest fix is to show the parent which voice will
 * actually be used and let them change it.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardTitle, Notice, PageHeader } from '../components/ui'
import { useApp } from '../context/AppContext'
import { ACCENTS, SPEEDS, describeVoice, speak, speechSupported, stopSpeaking, type Accent } from '../services/speechService'
import { setNeuralEnabled } from '../services/neuralVoice'
import { firebaseEnabled } from '../lib/firebase'

export default function SettingsScreen() {
  const { settings, setSettings, storage, serverOcr } = useApp()
  const [englishVoice, setEnglishVoice] = useState<string | null>(null)
  const [chineseVoice, setChineseVoice] = useState<string | null>(null)

  useEffect(() => {
    void describeVoice('en', settings.accent).then(setEnglishVoice)
    void describeVoice('zh').then(setChineseVoice)
  }, [settings.accent])

  const preview = (accent: Accent, rate: number) => {
    stopSpeaking()
    void speak('beautiful butterfly', { lang: 'en', accent, rate })
  }

  return (
    <main className="page">
      <PageHeader emoji="⚙️" title="Voice &amp; settings" />

      {!speechSupported() && (
        <div className="mb-3">
          <Notice tone="warn">This browser cannot speak. Try Chrome, Safari or Edge.</Notice>
        </div>
      )}

      <AccountCard />

      <Card className="mb-3">
        <CardTitle>✨ Natural voice</CardTitle>
        <button
          onClick={() => {
            const next = !settings.naturalVoice
            setSettings({ naturalVoice: next })
            setNeuralEnabled(next)
            preview(settings.accent, settings.rate)
          }}
          aria-pressed={settings.naturalVoice}
          className={`btn mt-2 w-full justify-between border-[2.5px] ${
            settings.naturalVoice
              ? 'border-grape bg-grape-50 text-grape-600'
              : 'border-grape-100 bg-white text-ink'
          }`}
        >
          <span>{settings.naturalVoice ? 'On — a real human-sounding voice' : 'Off — this device’s built-in voice'}</span>
          <span aria-hidden>{settings.naturalVoice ? '✓' : ''}</span>
        </button>
        <p className="mt-3 text-xs text-ink-soft">
          The natural voice is downloaded as it is needed, so it wants the internet the first time it says a
          word — after that the word is saved and works offline. Each word is sent to the voice service to be
          read aloud. Turn this off to keep every word on this device.
        </p>
      </Card>

      <Card className="mb-3">
        <CardTitle>🗣️ Accent</CardTitle>
        <div className="space-y-2">
          {ACCENTS.map((accent) => (
            <button
              key={accent.value}
              onClick={() => {
                setSettings({ accent: accent.value })
                preview(accent.value, settings.rate)
              }}
              aria-pressed={settings.accent === accent.value}
              className={`btn w-full justify-start border-[2.5px] ${
                settings.accent === accent.value
                  ? 'border-grape bg-grape-50 text-grape-600'
                  : 'border-grape-100 bg-white text-ink'
              }`}
            >
              <span aria-hidden>{accent.flag}</span> {accent.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          {englishVoice
            ? `This device will use: ${englishVoice}`
            : 'No English voice was found on this device. Install one in your device settings.'}
        </p>
      </Card>

      <Card className="mb-3">
        <CardTitle>🐢 Speaking speed</CardTitle>
        <div className="grid grid-cols-3 gap-2">
          {SPEEDS.map((speed) => (
            <button
              key={speed.value}
              onClick={() => {
                setSettings({ rate: speed.value })
                preview(settings.accent, speed.value)
              }}
              aria-pressed={settings.rate === speed.value}
              className={`btn border-[2.5px] ${
                settings.rate === speed.value
                  ? 'border-grape bg-grape-50 text-grape-600'
                  : 'border-grape-100 bg-white text-ink'
              }`}
            >
              {speed.label}
            </button>
          ))}
        </div>
        <button className="btn-ghost mt-3 w-full" onClick={() => preview(settings.accent, settings.rate)}>
          🔊 Try it
        </button>
        <p className="mt-3 text-xs text-ink-soft">
          A “Say it slowly” button is always available during a test, so the everyday speed can stay natural.
        </p>
      </Card>

      <Card className="mb-3">
        <CardTitle>🀄 Chinese voice</CardTitle>
        {chineseVoice ? (
          <>
            <p className="text-sm text-ink-soft">This device will use: {chineseVoice}</p>
            <button
              className="btn-ghost mt-3 w-full"
              onClick={() => {
                stopSpeaking()
                void speak('水', { lang: 'zh', rate: settings.rate })
              }}
            >
              🔊 Try it (水)
            </button>
          </>
        ) : (
          <Notice tone="warn">
            No Chinese voice is installed on this device, so Chinese words cannot be spoken. Install one in your
            device’s language or accessibility settings.
          </Notice>
        )}
      </Card>

      <Card className="mb-3">
        <CardTitle>👤 Who is practising?</CardTitle>
        <input
          className="field"
          placeholder="Child's name (optional)"
          value={settings.childName}
          onChange={(e) => setSettings({ childName: e.target.value })}
          aria-label="Child's name"
        />
      </Card>

      <Card>
        <CardTitle>ℹ️ How this app is set up</CardTitle>
        <ul className="space-y-1.5 text-sm text-ink-soft">
          <li>
            <strong className="text-ink">Words are saved:</strong>{' '}
            {storage === 'firestore' ? 'in Firebase, synced across devices' : 'on this device only'}
          </li>
          <li>
            <strong className="text-ink">Photos are read by:</strong>{' '}
            {serverOcr ? 'the server reader (best quality)' : 'the on-device reader (works offline)'}
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink-soft">
          Both can be upgraded with configuration — see the README.
        </p>
        <Link to="/" className="btn-ghost mt-4 w-full">
          ← Back home
        </Link>
      </Card>
    </main>
  )
}

/**
 * Sign-in, and what it changes.
 *
 * Deliberately framed as an upgrade rather than a gate: the app works fully
 * signed out, so this card explains what syncing buys rather than demanding it.
 */
function AccountCard() {
  const { account, accountReady, signIn, signOut, storage, words } = useApp()
  const [busy, setBusy] = useState(false)

  if (!firebaseEnabled()) return null

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-3">
      <CardTitle>☁️ Sync across devices</CardTitle>

      {!accountReady ? (
        <p className="mt-2 text-sm text-ink-soft">Checking…</p>
      ) : account ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            {account.photoURL ? (
              <img src={account.photoURL} alt="" className="h-10 w-10 rounded-full" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-grape-100 text-lg">
                👤
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{account.name ?? 'Signed in'}</p>
              <p className="truncate text-xs text-ink-soft">{account.email}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            {storage === 'firestore'
              ? `${words.length} word${words.length === 1 ? '' : 's'} synced. Sign in on another device to see the same list.`
              : 'Signed in, but words are still saving to this device.'}
          </p>
          <button className="btn-quiet mt-3 w-full" onClick={() => void run(signOut)} disabled={busy}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            Words are saved on this device. Sign in to use the same list on a phone and a tablet — anything
            already saved here comes with you.
          </p>
          <button className="btn-primary mt-3 w-full" onClick={() => void run(signIn)} disabled={busy}>
            {busy ? 'Opening Google…' : 'Sign in with Google'}
          </button>
        </>
      )}
    </Card>
  )
}

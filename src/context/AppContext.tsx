/**
 * One place that owns the word list, the settings and the toast.
 *
 * Screens read from here rather than hitting the repository directly, so a
 * word added on the Scan screen is instantly visible on My Words without a
 * refetch, and swapping Firestore in or out changes nothing above this line.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getWordsRepository, type AddWordInput, type WordsRepository } from '../services/wordsRepository'
import { isServerOcrConfigured } from '../services/ocrService'
import type { Accent } from '../services/speechService'
import { setNeuralEnabled } from '../services/neuralVoice'
import type { Attempt, SpellingWord } from '../types'

interface Settings {
  accent: Accent
  rate: number
  childName: string
  /** Off falls back to the device voice, and sends no word to the voice service. */
  naturalVoice: boolean
}

const SETTINGS_KEY = 'sc2_settings'

const DEFAULT_SETTINGS: Settings = {
  // Singapore first: this app is used in Singapore primary schools, and the old
  // version reading "colour" in a US accent was a real complaint.
  accent: 'en-SG',
  rate: 0.9,
  childName: '',
  naturalVoice: true,
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

interface AppValue {
  words: SpellingWord[]
  loading: boolean
  error: string | null
  storage: WordsRepository['kind'] | null
  serverOcr: boolean | null
  settings: Settings
  toast: string | null
  setSettings: (patch: Partial<Settings>) => void
  showToast: (message: string) => void
  clearToast: () => void
  addWords: (inputs: AddWordInput[]) => Promise<{ added: SpellingWord[]; duplicates: string[] }>
  updateWord: (id: string, patch: Partial<SpellingWord>) => Promise<void>
  removeWord: (id: string) => Promise<void>
  recordAttempt: (word: SpellingWord, answer: string, correct: boolean, elapsedMs?: number) => Promise<void>
  listAttempts: (limit?: number) => Promise<Attempt[]>
  refresh: () => Promise<void>
}

const AppContext = createContext<AppValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [words, setWords] = useState<SpellingWord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [storage, setStorage] = useState<WordsRepository['kind'] | null>(null)
  const [serverOcr, setServerOcr] = useState<boolean | null>(null)
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const [toast, setToast] = useState<string | null>(null)

  // The speech service is a module, not a hook, so the stored preference has to
  // be pushed into it — including on first load, before anything is spoken.
  useEffect(() => {
    setNeuralEnabled(settings.naturalVoice)
  }, [settings.naturalVoice])

  const refresh = useCallback(async () => {
    try {
      const repo = await getWordsRepository()
      setStorage(repo.kind)
      setWords(await repo.list())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    void isServerOcrConfigured().then(setServerOcr)
  }, [refresh])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200)
  }, [])

  const clearToast = useCallback(() => setToast(null), [])

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch {
        /* settings are a convenience; failing to persist them is not fatal */
      }
      return next
    })
  }, [])

  const addWords = useCallback(async (inputs: AddWordInput[]) => {
    const repo = await getWordsRepository()
    const result = await repo.addMany(inputs)
    if (result.added.length) setWords((current) => [...current, ...result.added])
    return result
  }, [])

  const updateWord = useCallback(async (id: string, patch: Partial<SpellingWord>) => {
    const repo = await getWordsRepository()
    await repo.update(id, patch)
    setWords((current) => current.map((w) => (w.id === id ? { ...w, ...patch, updatedAt: Date.now() } : w)))
  }, [])

  const removeWord = useCallback(async (id: string) => {
    const repo = await getWordsRepository()
    await repo.remove(id)
    setWords((current) => current.filter((w) => w.id !== id))
  }, [])

  const recordAttempt = useCallback(
    async (word: SpellingWord, answer: string, correct: boolean, elapsedMs?: number) => {
      const repo = await getWordsRepository()
      const updated = await repo.recordAttempt(word, answer, correct, elapsedMs)
      setWords((current) => current.map((w) => (w.id === word.id ? updated : w)))
    },
    [],
  )

  const listAttempts = useCallback(async (limit?: number) => {
    const repo = await getWordsRepository()
    return repo.listAttempts(limit)
  }, [])

  const value = useMemo<AppValue>(
    () => ({
      words,
      loading,
      error,
      storage,
      serverOcr,
      settings,
      toast,
      setSettings,
      showToast,
      clearToast,
      addWords,
      updateWord,
      removeWord,
      recordAttempt,
      listAttempts,
      refresh,
    }),
    [
      words,
      loading,
      error,
      storage,
      serverOcr,
      settings,
      toast,
      setSettings,
      showToast,
      clearToast,
      addWords,
      updateWord,
      removeWord,
      recordAttempt,
      listAttempts,
      refresh,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}

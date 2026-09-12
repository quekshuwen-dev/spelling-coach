import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { accuracyOf, statusOf } from '../config/scoring'
import { Card, PageHeader, Stat } from '../components/ui'

export default function HomeScreen() {
  const { words, loading, storage, settings } = useApp()

  const mastered = words.filter((w) => statusOf(w) === 'mastered').length
  const toPractise = words.filter((w) => ['needs-practice', 'new'].includes(statusOf(w))).length
  const practised = words.filter((w) => w.practiceCount > 0)
  const recentAccuracy = practised.length
    ? Math.round((practised.reduce((sum, w) => sum + accuracyOf(w), 0) / practised.length) * 100)
    : null

  const greeting = settings.childName ? `Hello, ${settings.childName}!` : 'Spelling Coach'

  return (
    <main className="page">
      <PageHeader emoji="🦉" title={greeting} subtitle="Scan a list. Pick the words. Practise by ear." />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat value={loading ? '—' : words.length} label="My words" />
        <Stat value={loading ? '—' : mastered} label="Mastered" tone="leaf" />
        <Stat
          value={recentAccuracy === null ? '—' : `${recentAccuracy}%`}
          label="Accuracy"
          tone={recentAccuracy !== null && recentAccuracy < 70 ? 'berry' : 'grape'}
        />
      </div>

      <div className="space-y-3">
        <Link to="/scan" className="btn-primary w-full text-lg">
          📷 Scan Words
        </Link>
        <Link to="/words" className="btn-ghost w-full text-lg">
          📚 My Spelling List
        </Link>
        <Link
          to="/test"
          className={`w-full text-lg ${words.length ? 'btn-success' : 'btn-quiet min-h-[3.25rem]'}`}
          aria-disabled={words.length === 0}
        >
          🎧 Start Spelling Test
        </Link>
      </div>

      {toPractise > 0 && (
        <Card className="mt-4">
          <p className="text-sm">
            <strong>{toPractise}</strong> {toPractise === 1 ? 'word needs' : 'words need'} more practice.{' '}
            <Link to="/test" className="font-bold text-grape underline">
              Practise the tricky ones →
            </Link>
          </p>
        </Card>
      )}

      <div className="mt-6 text-center">
        <Link to="/settings" className="text-sm font-semibold text-ink-soft underline">
          ⚙️ Voice &amp; settings
        </Link>
        {storage === 'local' && (
          <p className="mx-auto mt-3 max-w-sm text-xs text-ink-soft">
            Words are saved on this device. Add a Firebase config to sync them across devices — see the README.
          </p>
        )}
      </div>
    </main>
  )
}

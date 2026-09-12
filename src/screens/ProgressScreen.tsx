import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardTitle, EmptyState, PageHeader, ProgressBar, Stat, StatusPill } from '../components/ui'
import { useApp } from '../context/AppContext'
import { STATUS_LABEL, accuracyOf, statusOf } from '../config/scoring'
import type { Attempt, MasteryStatus } from '../types'

const ORDER: MasteryStatus[] = ['mastered', 'good', 'learning', 'needs-practice', 'new']

export default function ProgressScreen() {
  const { words, listAttempts } = useApp()
  const [attempts, setAttempts] = useState<Attempt[]>([])

  useEffect(() => {
    void listAttempts(40).then(setAttempts).catch(() => setAttempts([]))
  }, [listAttempts])

  const counts = useMemo(() => {
    const map = Object.fromEntries(ORDER.map((s) => [s, 0])) as Record<MasteryStatus, number>
    words.forEach((w) => {
      map[statusOf(w)] += 1
    })
    return map
  }, [words])

  const practised = words.filter((w) => w.practiceCount > 0)
  const overall = practised.length
    ? Math.round((practised.reduce((sum, w) => sum + accuracyOf(w), 0) / practised.length) * 100)
    : null

  // "Recent" = the last 20 attempts, which is roughly two test rounds. It moves
  // faster than the all-time figure, so effort this week actually shows up.
  const recent = attempts.slice(0, 20)
  const recentAccuracy = recent.length
    ? Math.round((recent.filter((a) => a.correct).length / recent.length) * 100)
    : null

  const trickiest = [...words]
    .filter((w) => w.incorrectCount > 0)
    .sort((a, b) => accuracyOf(a) - accuracyOf(b) || b.incorrectCount - a.incorrectCount)
    .slice(0, 5)

  if (words.length === 0) {
    return (
      <main className="page">
        <PageHeader emoji="📊" title="My Progress" />
        <Card>
          <EmptyState
            emoji="🌱"
            title="Nothing to show yet"
            body="Scan some words and take a test — your progress will appear here."
            action={
              <Link className="btn-primary" to="/scan">
                📷 Scan a list
              </Link>
            }
          />
        </Card>
      </main>
    )
  }

  return (
    <main className="page">
      <PageHeader emoji="📊" title="My Progress" subtitle="How the spelling is going." />

      <div className="mb-3 grid grid-cols-3 gap-3">
        <Stat value={words.length} label="Total words" />
        <Stat value={counts.mastered} label="Mastered" tone="leaf" />
        <Stat
          value={recentAccuracy === null ? '—' : `${recentAccuracy}%`}
          label="Recent accuracy"
          tone={recentAccuracy !== null && recentAccuracy < 70 ? 'berry' : 'grape'}
        />
      </div>

      <Card className="mb-3">
        <CardTitle>🏅 How my words are doing</CardTitle>
        <div className="space-y-3">
          {ORDER.filter((status) => counts[status] > 0).map((status) => (
            <div key={status}>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-ink-soft">
                <StatusPill status={status} />
                <span>
                  {counts[status]} of {words.length}
                </span>
              </div>
              <ProgressBar value={counts[status] / words.length} label={STATUS_LABEL[status]} />
            </div>
          ))}
        </div>
        {overall !== null && (
          <p className="mt-4 text-sm text-ink-soft">
            All-time accuracy across {practised.length} practised {practised.length === 1 ? 'word' : 'words'}:{' '}
            <strong className="text-ink">{overall}%</strong>
          </p>
        )}
      </Card>

      {trickiest.length > 0 && (
        <Card className="mb-3">
          <CardTitle>💪 Words to work on</CardTitle>
          <ul className="divide-y divide-grape-50">
            {trickiest.map((word) => (
              <li key={word.id} className="flex items-center justify-between py-2.5">
                <span className="font-bold">{word.word}</span>
                <span className="text-xs text-ink-soft">
                  {word.correctCount}/{word.practiceCount} right · {Math.round(accuracyOf(word) * 100)}%
                </span>
              </li>
            ))}
          </ul>
          <Link className="btn-primary mt-3 w-full" to="/test" state={{ mode: 'needs-practice' }}>
            🎧 Practise these now
          </Link>
        </Card>
      )}

      <Card>
        <CardTitle>🕑 Recent answers</CardTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-soft">No tests taken yet.</p>
        ) : (
          <ul className="divide-y divide-grape-50">
            {recent.map((attempt) => (
              <li key={attempt.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span aria-hidden>{attempt.correct ? '✅' : '📝'}</span>
                <span className="flex-1 font-semibold">{attempt.word}</span>
                {!attempt.correct && <span className="text-xs text-berry">wrote “{attempt.answer}”</span>}
                <span className="text-xs text-ink-soft">
                  {new Date(attempt.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  )
}

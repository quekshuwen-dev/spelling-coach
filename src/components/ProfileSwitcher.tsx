/**
 * "Who is practising" — a persistent header, mounted once in App.tsx, so it
 * is impossible to be deep in someone else's word list without noticing.
 *
 * Deliberately a compact button that opens a picker, not a full screen: this
 * is checked constantly (every session, sometimes mid-session when a sibling
 * takes over) but changed rarely, so it should cost one glance and one tap.
 */
import { useState } from 'react'
import { Modal } from './ui'
import { useApp } from '../context/AppContext'
import { MAX_PROFILES, PROFILE_EMOJI } from '../services/profileService'

export default function ProfileSwitcher() {
  const { profiles, activeProfile, switchProfile, createProfile, renameProfile, removeProfile } = useApp()
  const [open, setOpen] = useState(false)

  if (!activeProfile) return null

  return (
    <>
      <div className="sticky top-0 z-40 flex justify-center bg-cream/95 py-2 backdrop-blur">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm shadow-soft active:scale-[0.97]"
          aria-label={`Practising as ${activeProfile.name}. Tap to switch.`}
        >
          <span className="text-xl leading-none" aria-hidden>
            {activeProfile.emoji}
          </span>
          <span className="font-bold text-ink">{activeProfile.name}</span>
          <span aria-hidden className="text-ink-soft">
            ▾
          </span>
        </button>
      </div>

      {open && (
        <ProfilePicker
          profiles={profiles}
          activeId={activeProfile.id}
          onSwitch={async (id) => {
            await switchProfile(id)
            setOpen(false)
          }}
          onCreate={createProfile}
          onRename={renameProfile}
          onRemove={removeProfile}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ProfilePicker({
  profiles,
  activeId,
  onSwitch,
  onCreate,
  onRename,
  onRemove,
  onClose,
}: {
  profiles: { id: string; name: string; emoji: string }[]
  activeId: string
  onSwitch: (id: string) => void
  onCreate: (name: string, emoji?: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onClose: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  return (
    <Modal title="👋 Who is practising?" onClose={onClose}>
      <ul className="space-y-2">
        {profiles.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            {renamingId === p.id ? (
              <>
                <input
                  className="field flex-1"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  aria-label={`New name for ${p.name}`}
                  autoFocus
                />
                <button
                  className="btn-success min-h-[2.75rem] px-3 text-sm"
                  onClick={async () => {
                    if (renameValue.trim()) await onRename(p.id, renameValue.trim())
                    setRenamingId(null)
                  }}
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onSwitch(p.id)}
                  aria-pressed={p.id === activeId}
                  className={`btn flex-1 justify-start gap-2 border-[2.5px] ${
                    p.id === activeId ? 'border-grape bg-grape-50 text-grape-600' : 'border-grape-100 bg-white text-ink'
                  }`}
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {p.emoji}
                  </span>
                  {p.name}
                </button>
                <button
                  onClick={() => {
                    setRenamingId(p.id)
                    setRenameValue(p.name)
                  }}
                  aria-label={`Rename ${p.name}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-grape-50"
                >
                  ✏️
                </button>
                <button
                  onClick={() => void onRemove(p.id)}
                  aria-label={`Remove ${p.name}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft
                             hover:bg-berry-50 hover:text-berry"
                >
                  ✕
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {profiles.length < MAX_PROFILES &&
        (adding ? (
          <div className="mt-3 flex gap-2">
            <input
              className="field flex-1"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="New profile's name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && newName.trim() && void onCreate(newName.trim())}
            />
            <button
              className="btn-success min-h-[2.75rem] px-3 text-sm"
              onClick={async () => {
                if (!newName.trim()) return
                await onCreate(newName.trim(), PROFILE_EMOJI[profiles.length % PROFILE_EMOJI.length])
                setNewName('')
                setAdding(false)
              }}
            >
              Add
            </button>
          </div>
        ) : (
          <button className="btn-ghost mt-3 w-full" onClick={() => setAdding(true)}>
            ➕ Add a profile
          </button>
        ))}

      <p className="mt-4 text-center text-xs text-ink-soft">
        Each profile has its own words. Switching does not delete anything.
      </p>
    </Modal>
  )
}

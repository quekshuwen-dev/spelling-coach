/**
 * The three subject folders a word list is filed into.
 *
 * Fixed, not user-editable: this is what was actually asked for (School
 * English, School Chinese, Tuition), and a fixed set means every screen that
 * shows a folder chip can just map over FOLDERS rather than managing a
 * folder-CRUD flow that adds a lot of surface for very little real benefit
 * here — a child has three subjects, not an arbitrary filing system.
 */
import type { FolderId, WordLang } from '../types'

export interface FolderDef {
  id: FolderId
  label: string
  emoji: string
}

export const FOLDERS: FolderDef[] = [
  { id: 'school-english', label: 'School English', emoji: '📘' },
  { id: 'school-chinese', label: 'School Chinese', emoji: '📕' },
  { id: 'tuition', label: 'Tuition', emoji: '📗' },
]

export const DEFAULT_FOLDER: FolderId = 'school-english'

export function folderFor(id: FolderId): FolderDef {
  return FOLDERS.find((f) => f.id === id) ?? FOLDERS[0]
}

/**
 * Where a word lands before anyone re-files it — by language, since that is
 * the one signal available at save time and it is usually right (a scanned
 * Chinese list is a School Chinese list far more often than not).
 */
export function suggestFolder(lang: WordLang): FolderId {
  return lang === 'en' ? 'school-english' : 'school-chinese'
}

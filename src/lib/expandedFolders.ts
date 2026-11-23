/**
 * Which folders are open in the file list, remembered per browser so the tree
 * looks the same after a reload. Stored as a list of folder ids.
 */

const KEY = 'smartsht-expanded-folders'

export function loadExpandedFolders(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Saves the open folders, dropping ids of folders that no longer exist. */
export function saveExpandedFolders(expanded: Set<string>, existingIds: Iterable<string>): void {
  const existing = new Set(existingIds)
  try {
    localStorage.setItem(KEY, JSON.stringify([...expanded].filter((id) => existing.has(id))))
  } catch {
    // storage unavailable: the tree resets on reload
  }
}

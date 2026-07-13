/** Migrate a localStorage key once from an old name to a new name. */
export function migrateLocalStorageKey(oldKey: string, newKey: string): void {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(newKey) != null) return
  const old = localStorage.getItem(oldKey)
  if (old == null) return
  localStorage.setItem(newKey, old)
  localStorage.removeItem(oldKey)
}

/** One-time migrations from legacy `smartshit-*` keys to `smartsht-*`. */
export function migrateLegacyStorageKeys(): void {
  migrateLocalStorageKey('smartshit-state-v1', 'smartsht-state-v1')
  migrateLocalStorageKey('smartshit-welcome-dismissed', 'smartsht-welcome-dismissed')
  migrateLocalStorageKey('smartshit-community-templates', 'smartsht-community-templates')
  migrateLocalStorageKey('smartshit-v1-telemetry', 'smartsht-v1-telemetry')
  migrateLocalStorageKey('smartshit-v1-chat-feedback', 'smartsht-v1-chat-feedback')
}

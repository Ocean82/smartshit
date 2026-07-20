/**
 * Panel system type definitions.
 * Each panel has an ID, icon, label, and default width.
 */

export type PanelId = 'chat' | 'insights' | 'auditor' | 'inspector'

export interface PanelDef {
  id: PanelId
  icon: string
  label: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
}

export const PANELS: PanelDef[] = [
  { id: 'chat', icon: '💬', label: 'Chat', defaultWidth: 360, minWidth: 280, maxWidth: 500 },
  { id: 'insights', icon: '📊', label: 'Insights', defaultWidth: 320, minWidth: 260, maxWidth: 480 },
  { id: 'auditor', icon: '🛡️', label: 'Auditor', defaultWidth: 300, minWidth: 260, maxWidth: 440 },
  { id: 'inspector', icon: '🔬', label: 'Inspector', defaultWidth: 300, minWidth: 260, maxWidth: 440 },
]

export function getPanelDef(id: PanelId): PanelDef {
  return PANELS.find((p) => p.id === id)!
}

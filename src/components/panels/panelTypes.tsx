/**
 * Panel system type definitions.
 * Each panel has an ID, icon, label, and default width.
 */

import type { ReactNode } from 'react'
import { BarChart3, Microscope, MessageSquare, Shield } from 'lucide-react'

export type PanelId = 'chat' | 'insights' | 'auditor' | 'inspector'

export interface PanelDef {
  id: PanelId
  icon: ReactNode
  label: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
}

export const PANELS: PanelDef[] = [
  { id: 'chat', icon: <MessageSquare size={15} strokeWidth={1.8} className="text-[var(--accent-600)]" />, label: 'Chat', defaultWidth: 360, minWidth: 280, maxWidth: 500 },
  { id: 'insights', icon: <BarChart3 size={15} strokeWidth={1.8} style={{ color: 'oklch(0.45 0.14 155)' }} />, label: 'Insights', defaultWidth: 320, minWidth: 260, maxWidth: 480 },
  { id: 'auditor', icon: <Shield size={15} strokeWidth={1.8} style={{ color: 'oklch(0.50 0.14 70)' }} />, label: 'Auditor', defaultWidth: 300, minWidth: 260, maxWidth: 440 },
  { id: 'inspector', icon: <Microscope size={15} strokeWidth={1.8} style={{ color: 'oklch(0.42 0.14 300)' }} />, label: 'Inspector', defaultWidth: 300, minWidth: 260, maxWidth: 440 },
]

/**
 * Retrieves the definition for a panel identifier.
 *
 * @param id - The identifier of the panel to retrieve
 * @returns The matching {@link PanelDef} — always defined for valid {@link PanelId} values.
 * @throws {TypeError} If `id` is not present in {@link PANELS} (non-null assertion fails at runtime).
 */
export function getPanelDef(id: PanelId): PanelDef {
  return PANELS.find((p) => p.id === id)!
}

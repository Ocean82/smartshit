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
  { id: 'chat', icon: <MessageSquare size={15} strokeWidth={1.8} />, label: 'Chat', defaultWidth: 360, minWidth: 280, maxWidth: 500 },
  { id: 'insights', icon: <BarChart3 size={15} strokeWidth={1.8} />, label: 'Insights', defaultWidth: 320, minWidth: 260, maxWidth: 480 },
  { id: 'auditor', icon: <Shield size={15} strokeWidth={1.8} />, label: 'Auditor', defaultWidth: 300, minWidth: 260, maxWidth: 440 },
  { id: 'inspector', icon: <Microscope size={15} strokeWidth={1.8} />, label: 'Inspector', defaultWidth: 300, minWidth: 260, maxWidth: 440 },
]

export function getPanelDef(id: PanelId): PanelDef {
  return PANELS.find((p) => p.id === id)!
}

/**
 * Community Templates — Share and install templates between users.
 *
 * This is a file-based sharing mechanism (no cloud required):
 * - Export: User exports a template as a .json file
 * - Import: User loads a .json template file from another user
 * - Templates are stored in localStorage alongside the built-in library
 *
 * Format: SmartSh!t Template Package (.sht.json)
 */

import type { Skill } from '@/types'
import { v4 as uuid } from 'uuid'

export interface CommunityTemplate extends Skill {
  /** Author name (optional, user-supplied) */
  author?: string
  /** When the template was created/shared */
  sharedAt?: number
  /** Whether this is a user-installed community template */
  community: true
}

export interface TemplatePackage {
  version: 1
  type: 'smartsht-template'
  template: {
    name: string
    description: string
    prompt: string
    icon: string
    category: string
    author?: string
    tags?: string[]
  }
}

const STORAGE_KEY = 'smartsht-community-templates'

// ─── Load/Save from localStorage ─────────────────────────────────────────────

export function loadCommunityTemplates(): CommunityTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCommunityTemplates(templates: CommunityTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch {
    // Storage full or unavailable
  }
}

// ─── Install a template from a package ───────────────────────────────────────

export function installTemplate(pkg: TemplatePackage): CommunityTemplate | null {
  if (pkg.version !== 1 || pkg.type !== 'smartsht-template') return null

  const { template: t } = pkg
  if (!t.name || !t.prompt) return null

  const newTemplate: CommunityTemplate = {
    id: `community-${uuid()}`,
    name: t.name,
    category: t.category || 'Personal Finance',
    description: t.description || '',
    prompt: t.prompt,
    tools: [],
    icon: t.icon || '📄',
    author: t.author,
    sharedAt: Date.now(),
    community: true,
  }

  const existing = loadCommunityTemplates()
  // Don't install duplicates (by name + prompt)
  if (existing.some((e) => e.name === newTemplate.name && e.prompt === newTemplate.prompt)) {
    return null
  }

  existing.push(newTemplate)
  saveCommunityTemplates(existing)
  return newTemplate
}

// ─── Remove a community template ────────────────────────────────────────────

export function removeCommunityTemplate(id: string): void {
  const existing = loadCommunityTemplates()
  saveCommunityTemplates(existing.filter((t) => t.id !== id))
}

// ─── Export a template as a shareable package ────────────────────────────────

export function exportTemplateAsPackage(template: { name: string; description: string; prompt: string; icon: string; category: string; author?: string }): void {
  const pkg: TemplatePackage = {
    version: 1,
    type: 'smartsht-template',
    template: {
      name: template.name,
      description: template.description,
      prompt: template.prompt,
      icon: template.icon,
      category: template.category,
      author: template.author,
    },
  }

  const json = JSON.stringify(pkg, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${template.name.toLowerCase().replace(/\s+/g, '-')}.sht.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Import a template from a file ──────────────────────────────────────────

export function importTemplateFromFile(file: File): Promise<CommunityTemplate | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const pkg = JSON.parse(text) as TemplatePackage
        const result = installTemplate(pkg)
        resolve(result)
      } catch {
        resolve(null)
      }
    }
    reader.onerror = () => resolve(null)
    reader.readAsText(file)
  })
}

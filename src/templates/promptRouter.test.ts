import { describe, expect, it } from 'vitest'
import { resolveGalleryTemplate } from './promptRouter'
import { templates } from '@/data/templates'
import { TEMPLATE_SPECS } from './registry'

describe('resolveGalleryTemplate', () => {
  it('matches every gallery prompt that has a registered template spec', () => {
    const withSpecs = templates.filter((t) => t.tools.some((tool) => tool in TEMPLATE_SPECS))
    expect(withSpecs.length).toBeGreaterThanOrEqual(50)

    for (const t of withSpecs) {
      const match = resolveGalleryTemplate(t.prompt)
      expect(match, t.prompt).not.toBeNull()
      expect(match!.tool).toBe(t.tools.find((tool) => tool in TEMPLATE_SPECS))
    }
  })

  it('matches niche templates by name and create-prefix phrasing', () => {
    expect(resolveGalleryTemplate('Wedding Budget')?.tool).toBe('create_wedding_budget')
    expect(resolveGalleryTemplate('create a wedding budget')?.tool).toBe('create_wedding_budget')
    expect(resolveGalleryTemplate('Create a wedding budget tracker')?.tool).toBe('create_wedding_budget')
    expect(resolveGalleryTemplate('make a workout log')?.tool).toBe('create_workout_log')
  })

  it('matches core gallery templates', () => {
    expect(resolveGalleryTemplate('Create a monthly budget template')?.tool).toBe('create_budget_template')
    expect(resolveGalleryTemplate('create a sales tracker')?.tool).toBe('create_sales_tracker')
  })

  it('prefers the longer / more specific name when phrases overlap', () => {
    // "wedding budget" must not resolve to the generic monthly budget
    expect(resolveGalleryTemplate('wedding budget')?.tool).toBe('create_wedding_budget')
  })

  it('does not match analysis presets (tools: [])', () => {
    expect(resolveGalleryTemplate('Explain this spreadsheet I just loaded and highlight the biggest budget risks')).toBeNull()
    expect(resolveGalleryTemplate('Where am I overspending and what are the top 3 categories to fix first?')).toBeNull()
  })

  it('does not match bare generic words that are too short to be a template name', () => {
    expect(resolveGalleryTemplate('budget')).toBeNull()
    expect(resolveGalleryTemplate('hello')).toBeNull()
    expect(resolveGalleryTemplate('bold the headers')).toBeNull()
  })

  it('matches a template name embedded in a short request sentence', () => {
    expect(resolveGalleryTemplate('I need a wedding budget please')?.tool).toBe('create_wedding_budget')
  })
})

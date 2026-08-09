/**
 * Property-Based Tests for Template Library Expansion
 *
 * Uses fast-check to verify universal correctness properties across
 * the entire template corpus.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ALL_TEMPLATE_SPECS } from '@/templates/registry';
import { templates, templateCategories, searchTemplates } from './templates';

/**
 * Property 1: Minimum Category Population
 *
 * For any category in `templateCategories`, the number of templates
 * assigned to that category SHALL be at least 6.
 *
 * **Validates: Requirements 1.3**
 */
describe('Property 1: Minimum Category Population', () => {
  it('every category has at least 6 templates', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...templateCategories),
        (category) => {
          const count = templates.filter(t => t.category === category).length;
          expect(count).toBeGreaterThanOrEqual(6);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 2: Sample Data Presence in Template Specs
 *
 * For any template with a registered TemplateSpec, the spec's `cells` object
 * SHALL contain at least 3 data rows beyond the header row.
 *
 * **Validates: Requirements 2.3, 3.3, 5.3, 6.3, 7.3, 11.2**
 */
describe('Property 2: Sample Data Presence in Template Specs', () => {
  it('every template spec has at least 3 data rows beyond headers', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_TEMPLATE_SPECS),
        (spec) => {
          const cellKeys = Object.keys(spec.cells);
          // Extract row numbers from cell references like "A1", "B12"
          const rows = new Set(cellKeys.map(key => parseInt(key.replace(/[A-Z]+/g, ''), 10)));
          const sortedRows = [...rows].sort((a, b) => a - b);
          // First distinct row is considered the header row.
          // At minimum: header + 3 data rows = 4 distinct rows
          expect(sortedRows.length).toBeGreaterThanOrEqual(4);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 3: Non-Empty Prompt for All Templates
 *
 * For any template, the `prompt` field SHALL be non-empty after trimming,
 * longer than 15 characters, and not equal to "create a spreadsheet".
 *
 * **Validates: Requirements 11.1, 15.1, 15.2**
 */
describe('Property 3: Non-Empty Prompt for All Templates', () => {
  it('every template has a specific, non-empty prompt >15 chars', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...templates),
        (template) => {
          const trimmed = template.prompt.trim();
          expect(trimmed.length).toBeGreaterThan(15);
          expect(trimmed.toLowerCase()).not.toBe('create a spreadsheet');
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 4: No Duplicate Prompts Within Category
 *
 * For any two distinct templates within the same category, their normalized
 * prompts SHALL NOT be identical.
 *
 * **Validates: Requirements 11.4, 14.2**
 */
describe('Property 4: No Duplicate Prompts Within Category', () => {
  it('no two templates in the same category have identical normalized prompts', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...templateCategories),
        (category) => {
          const categoryTemplates = templates.filter(t => t.category === category);
          const normalizedPrompts = categoryTemplates.map(t => t.prompt.toLowerCase().trim());
          const unique = new Set(normalizedPrompts);
          expect(unique.size).toBe(normalizedPrompts.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 5: Minimum Tags Per Template
 *
 * For any template (excluding analysis-only entries with `tools: []`),
 * the `tags` array SHALL contain at least 2 entries.
 *
 * **Validates: Requirements 12.1**
 */
describe('Property 5: Minimum Tags Per Template', () => {
  it('every non-analysis template has at least 2 tags', () => {
    const templatesWithTools = templates.filter(t => t.tools.length > 0);
    fc.assert(
      fc.property(
        fc.constantFrom(...templatesWithTools),
        (template) => {
          const tags = template.tags ?? [];
          expect(tags.length).toBeGreaterThanOrEqual(2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 6: Tag-Based Search Discoverability
 *
 * For any template and any tag in that template's `tags` array,
 * calling `searchTemplates(tag)` SHALL include that template in the results.
 *
 * **Validates: Requirements 12.2**
 */
describe('Property 6: Tag-Based Search Discoverability', () => {
  it('searching by any tag returns the template that has it', () => {
    const templatesWithTags = templates.filter(t => (t.tags ?? []).length > 0);
    fc.assert(
      fc.property(
        fc.constantFrom(...templatesWithTags),
        (template) => {
          const tags = template.tags ?? [];
          for (const tag of tags) {
            const results = searchTemplates(tag);
            expect(results.some(r => r.id === template.id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 7: Unique Template Identity
 *
 * For any two distinct templates in the `templates` array,
 * the pair (name, category) SHALL be unique.
 *
 * **Validates: Requirements 14.3**
 */
describe('Property 7: Unique Template Identity', () => {
  it('no two templates share the same (name, category) pair', () => {
    const pairs = templates.map(t => `${t.name}|||${t.category}`);
    const unique = new Set(pairs);
    expect(unique.size).toBe(pairs.length);
  });
});

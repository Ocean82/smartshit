/**
 * Resolve a chat message to a gallery template tool.
 *
 * Built-in templates in src/data/templates.ts already carry a natural-language
 * `prompt` and a `tools` list. This router lets typed chat ("Create a wedding
 * budget tracker") hit the same instant build path as the Template Gallery,
 * without bloating the LLM tool prompt with 48 niche names.
 */
import { templates, type Template } from '@/data/templates'
import { TEMPLATE_SPECS } from './registry'

export interface GalleryTemplateMatch {
  tool: string
  name: string
  prompt: string
  label: string
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s%-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripCreatePrefix(text: string): string {
  return text.replace(
    /^(please\s+)?(can you\s+)?(could you\s+)?(create|make|build|generate|set up|setup|start)\s+(me\s+)?(a|an|my)?\s*/,
    '',
  )
}

function templateTool(t: Template): string | null {
  const tool = t.tools.find((name) => name in TEMPLATE_SPECS)
  return tool ?? null
}

function toMatch(t: Template, tool: string): GalleryTemplateMatch {
  return {
    tool,
    name: t.name,
    prompt: t.prompt,
    label: tool.replace(/^create_/, '').replace(/_/g, ' '),
  }
}

/**
 * Match user chat input to a gallery template with a registered TemplateSpec.
 * Returns null when the message is not a clear template-build request.
 */
export function resolveGalleryTemplate(input: string): GalleryTemplateMatch | null {
  const normalized = normalize(input)
  if (!normalized) return null

  const candidates = templates
    .map((t) => {
      const tool = templateTool(t)
      return tool ? { template: t, tool } : null
    })
    .filter((c): c is { template: Template; tool: string } => c != null)

  if (candidates.length === 0) return null

  // 1. Exact prompt match (what the gallery sends into chat)
  for (const { template, tool } of candidates) {
    if (normalize(template.prompt) === normalized) return toMatch(template, tool)
  }

  // 2. Exact name match ("Wedding Budget")
  for (const { template, tool } of candidates) {
    if (normalize(template.name) === normalized) return toMatch(template, tool)
  }

  // 3. "Create a …" / "Make a …" stripped against name or prompt body
  const stripped = stripCreatePrefix(normalized)
  if (stripped !== normalized && stripped.length > 0) {
    let best: { template: Template; tool: string; score: number } | null = null

    for (const { template, tool } of candidates) {
      const name = normalize(template.name)
      const promptBody = stripCreatePrefix(normalize(template.prompt))
      const promptBodyNoTemplate = promptBody.replace(/\s+template$/, '')

      let score = 0
      if (stripped === name) score = 900 + name.length
      else if (stripped === promptBody || stripped === promptBodyNoTemplate) score = 850 + stripped.length
      else if (name.length >= 5 && (stripped === name || stripped.startsWith(`${name} `) || stripped.endsWith(` ${name}`))) {
        score = 800 + name.length
      } else if (promptBodyNoTemplate.length >= 8 && (
        stripped === promptBodyNoTemplate
        || promptBodyNoTemplate.startsWith(stripped)
        || stripped.startsWith(promptBodyNoTemplate)
      )) {
        score = 100 + Math.min(stripped.length, promptBodyNoTemplate.length)
      }

      if (score > 0 && (!best || score > best.score)) {
        best = { template, tool, score }
      }
    }

    if (best && best.score >= 100) return toMatch(best.template, best.tool)
  }

  // 4. Longest template name appearing as a phrase in the input
  //    ("I need a wedding budget please" → Wedding Budget)
  //    Requires name length >= 8 so short words like "budget" alone don't match.
  let bestName: { template: Template; tool: string; score: number } | null = null
  for (const { template, tool } of candidates) {
    const name = normalize(template.name)
    if (name.length < 8) continue
    const padded = ` ${normalized} `
    if (padded.includes(` ${name} `) || normalized === name) {
      const score = 200 + name.length
      if (!bestName || score > bestName.score) bestName = { template, tool, score }
    }
  }
  if (bestName) return toMatch(bestName.template, bestName.tool)

  return null
}

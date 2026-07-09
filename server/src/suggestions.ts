import { UserIntent } from '../../shared/intentTypes.js'
// Placeholder for an embedding function. In a real scenario, this would call an external embedding service.
async function getEmbeddings(text: string): Promise<number[]> {
  // Simulate embedding generation
  return text.split('').map((char) => char.charCodeAt(0) / 100)
}

interface SuggestionItem {
  query: string
  intent: UserIntent
  embeddings?: number[]
}

// A small, hardcoded knowledge base of common actions and questions
const KNOWLEDGE_BASE: SuggestionItem[] = [
  {
    query: "Analyze my data",
    intent: {
      intentType: 'analyze',
      rawQuery: "Analyze my data",
      confidence: 1.0,
      targetColumns: [],
      filters: {},
      parameters: {},
    },
  },
  {
    query: "Show me the sum of the Amount column",
    intent: {
      intentType: 'calculate',
      rawQuery: "Show me the sum of the Amount column",
      confidence: 1.0,
      targetColumns: ['Amount'],
      filters: {},
      parameters: { operation: 'sum' },
    },
  },
  {
    query: "Filter where Category is Food",
    intent: {
      intentType: 'filter',
      rawQuery: "Filter where Category is Food",
      confidence: 1.0,
      targetColumns: [],
      filters: { Category: 'Food' },
      parameters: {},
    },
  },
  {
    query: "Create a bar chart for Sales by Region",
    intent: {
      intentType: 'create_chart',
      rawQuery: "Create a bar chart for Sales by Region",
      confidence: 1.0,
      targetColumns: ['Sales', 'Region'],
      filters: {},
      parameters: { chartType: 'bar' },
    },
  },
  {
    query: "Clean my data",
    intent: {
      intentType: 'clean',
      rawQuery: "Clean my data",
      confidence: 1.0,
      targetColumns: [],
      filters: {},
      parameters: {},
    },
  },
]

// In a real scenario, embeddings would be pre-calculated and stored.
// For this example, we'll generate them on the fly.
async function initializeKnowledgeBaseEmbeddings() {
  for (const item of KNOWLEDGE_BASE) {
    item.embeddings = await getEmbeddings(item.query)
  }
}

initializeKnowledgeBaseEmbeddings()

function cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0)
  const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0))
  const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0))
  if (magnitude1 === 0 || magnitude2 === 0) return 0
  return dotProduct / (magnitude1 * magnitude2)
}

export async function getSimilarSuggestions(query: string, count = 3): Promise<string[]> {
  const queryEmbeddings = await getEmbeddings(query)

  const scoredSuggestions = KNOWLEDGE_BASE.map((item) => ({
    item,
    score: item.embeddings ? cosineSimilarity(queryEmbeddings, item.embeddings) : 0,
  }))

  scoredSuggestions.sort((a, b) => b.score - a.score)

  return scoredSuggestions.slice(0, count).map((item) => item.item.query)
}

import type { IntentType, UserIntent } from '../../shared/intentTypes.js'
import { config } from './config.js'
import { callProvider, providerIsConfigured, providerOrder } from './index.js' // Import LLM functions
import { parseUserIntent as keywordParseUserIntent } from './intentParser.js' // Import keyword parser for fallback

export async function parseIntentWithLlm(
  userMessage: string,
  history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [],
): Promise<UserIntent> {
  const systemPrompt = `You are an AI assistant tasked with understanding user intent for spreadsheet operations.
Given a user's message and conversation history, your goal is to extract their intent and relevant parameters into a structured JSON object.

Here are the possible intent types:
- 'read': User wants to view data.
- 'analyze': User wants to get insights, statistics, or patterns from data.
- 'write': User wants to modify cells, rows, or columns.
- 'format': User wants to apply formatting to the spreadsheet.
- 'create_chart': User wants to create a chart or visualization.
- 'create_formula': User wants to apply a formula or create a computed column.
- 'summarize': User wants a summary or aggregation of data (e.g., total, average).
- 'filter': User wants to filter rows based on conditions.
- 'sort': User wants to sort data.
- 'clean': User wants to clean or preprocess data (e.g., remove duplicates).
- 'budget': User is asking questions related to budgeting, expenses, income.
- 'report': User wants to generate a report.
- 'compare': User wants to compare data.
- 'find': User wants to find specific values or locations.
- 'calculate': User wants to perform a calculation.
- 'export': User wants to export the data.
- 'chat': General conversation or greeting.
- 'unknown\': If the intent cannot be determined from the above.\n\nWhen extracting `targetSheet` or `targetColumns`, if the current user message implies a reference to a previously mentioned sheet or column (e.g., using pronouns like "it" or "that", or by continuing a previous topic), infer the `targetSheet` or `targetColumns` from the `Conversation History`. If the user refers to an entity that was previously mentioned (e.g., "that column"), resolve "that" to the most recently relevant entity in the conversation history.

Extract the following information:
- \`intentType\`: (IntentType) The most appropriate intent type from the list above.
- \`targetSheet\`: (string | undefined) The name of the sheet the user is referring to.
- \`targetColumns\`: (string[]) A list of column names the user is referring to.
- \`targetRows\`: (string | undefined) A specific row or range of rows (e.g., "5-10", "all").
- \`filters\`: (Record<string, unknown>) Key-value pairs for filtering conditions (e.g., {"Category": "Food", "Amount": ">100"}).
- \`parameters\`: (Record<string, unknown>) Any other relevant parameters for the intent (e.g., for \'sort\': {"ascending": true}, for \'create_chart\': {"chartType": "bar"}).
- \`rawQuery\`: (string) The original user message.
- \`confidence\`: (number between 0.0 and 1.0) Your confidence in the accuracy of the extracted intent.

Respond ONLY with a JSON object. Do not include any other text.
Ensure the JSON is valid and can be directly parsed.

Example User Message: "Show me the top 5 expenses in the 'Budget' sheet."
Example JSON Response:
\`\`\`json
{
  "intentType": "filter",
  "targetSheet": "Budget",
  "targetColumns": ["expenses"],
  "targetRows": null,
  "filters": {},
  "parameters": {
    "n": 5,
    "position": "top"
  },
  "rawQuery": "Show me the top 5 expenses in the \'Budget\' sheet.",
  "confidence": 0.95
}
\`\`\`

Example User Message: "Analyze the 'Sales' column."
Example JSON Response:
\`\`\`json
{
  "intentType": "analyze",
  "targetSheet": null,
  "targetColumns": ["Sales"],
  "targetRows": null,
  "filters": {},
  "parameters": {},
  "rawQuery": "Analyze the \'Sales\' column.",
  "confidence": 0.9
}
\`\`\`

Example User Message: "What is the sum of 'Amount' in 'Sheet1'?"
Example JSON Response:
\`\`\`json
{
  "intentType": "calculate",
  "targetSheet": "Sheet1",
  "targetColumns": ["Amount"],
  "targetRows": null,
  "filters": {},
  "parameters": {
    "operation": "sum"
  },
  "rawQuery": "What is the sum of \'Amount\' in \'Sheet1\'?",
  "confidence": 0.98
}
\`\`\`

User Message: "${userMessage}"
Conversation History:
${history.map(m => `${m.role}: ${m.content}`).join('\n')}
JSON Response:`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.slice(-4), // Include last 4 turns for context
    { role: 'user' as const, content: userMessage },
  ]

  const availableProviders = providerOrder().filter(providerIsConfigured)

  let llmResponse = ''
  let usedProvider: string | null = null

  for (const provider of availableProviders) {
    try {
      llmResponse = await callProvider(provider, messages)
      usedProvider = provider
      break
    } catch (error) {
      console.error(`Error calling LLM provider ${provider}:`, error)
      // Continue to next provider
    }
  }

  if (!usedProvider) {
    console.warn('No LLM provider available for intent parsing. Falling back to keyword parser.')
    // Fallback to existing keyword-based parser if no LLM is available/successful
    return keywordParseUserIntent(userMessage)
  }

  try {
    const parsedIntent = JSON.parse(llmResponse)
    // Basic validation to ensure it matches UserIntent structure
    if (
      typeof parsedIntent.intentType === 'string' &&
      typeof parsedIntent.rawQuery === 'string' &&
      typeof parsedIntent.confidence === 'number' &&
      Array.isArray(parsedIntent.targetColumns) &&
      typeof parsedIntent.filters === 'object' &&
      typeof parsedIntent.parameters === 'object'
    ) {
      return parsedIntent as UserIntent
    } else {
      console.error('LLM response did not match UserIntent structure:', llmResponse)
      // Fallback to existing keyword-based parser if LLM response is malformed
      return keywordParseUserIntent(userMessage)
    }
  } catch (error) {
    console.error('Failed to parse LLM response as JSON:', llmResponse, error)
    // Fallback to existing keyword-based parser if JSON parsing fails
    return keywordParseUserIntent(userMessage)
  }
}

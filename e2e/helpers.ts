import { expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const BUDGET_XLSX = path.join(__dirname, 'fixtures', 'budget.xlsx')

/** Seed localStorage so the first-run welcome dialog never appears. */
export async function seedDismissedWelcome(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('smartsht-welcome-dismissed', '1')
    } catch {
      /* ignore */
    }
  })
}

/**
 * The app polls /health on load (serverHealth.ts). Vite proxies that to :8787,
 * which is not running under Playwright — fulfill here so preview logs stay quiet
 * and UI that watches health does not flap.
 */
export async function mockServerHealth(page: Page): Promise<void> {
  await page.route('**/health', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        ollama: false,
        modelRegistered: false,
        modelName: 'e2e',
        groq: true,
        openrouter: true,
      }),
    })
  })
}

export async function gotoApp(page: Page, search = ''): Promise<void> {
  await seedDismissedWelcome(page)
  await mockServerHealth(page)
  await page.goto(`./${search}`)
  await expect(page.getByRole('grid', { name: 'Spreadsheet grid' })).toBeVisible()
}

export function cell(page: Page, cellId: string) {
  return page.locator(`[data-cell-id="${cellId}"]`)
}

/** Import via the hidden file input (same path as File → Open...). */
export async function importBudgetXlsx(page: Page): Promise<void> {
  // MenuBar, Toolbar, and MobileMenu each mount their own import input.
  const input = page.locator('input[aria-label="Import spreadsheet file"]').first()
  await input.setInputFiles(BUDGET_XLSX)
  // Confirm dialog only appears when the workbook already has content.
  const confirm = page.getByRole('button', { name: 'Open file' })
  if (await confirm.isVisible({ timeout: 500 }).catch(() => false)) {
    await confirm.click()
  }
  await expect(cell(page, 'A1')).toContainText('Item', { timeout: 20_000 })
}

/** Type into a cell (starts edit), commit with Enter. */
export async function editCell(page: Page, cellId: string, value: string): Promise<void> {
  await cell(page, cellId).click()
  await page.keyboard.type(value)
  await page.keyboard.press('Enter')
}

/**
 * Mock the chat SSE endpoint. Returns the unique reply text so the test can assert it.
 * Also stubs the non-streaming fallback.
 */
export async function mockChatStream(page: Page, reply = 'E2E_MOCK_REPLY_OK'): Promise<string> {
  const sse =
    `data: ${JSON.stringify({ type: 'token', content: reply })}\n\n` +
    `data: ${JSON.stringify({ type: 'complete', message: reply, actions: [], source: 'llm' })}\n\n`

  await page.route('**/api/chat/stream', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse,
    })
  })
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: reply, actions: [], source: 'llm' }),
    })
  })
  return reply
}

/**
 * Anonymous mode, with the real Clerk key path built in but Clerk unreachable:
 * the grid, import, auditor and persistence work, and the browser never calls
 * our backend.
 */
import { expect, test, type Page } from '@playwright/test'
import { cell, importBudgetXlsx, seedDismissedWelcome } from './helpers'

const CHAT_PROMPT = 'write a short poem about my budget'

async function openAnon(page: Page) {
  const apiHits: string[] = []
  const external: string[] = []
  await seedDismissedWelcome(page)
  page.on('request', (req) => {
    const u = new URL(req.url())
    if (u.pathname.startsWith('/api/') || u.pathname === '/health') apiHits.push(req.url())
  })
  // Block Clerk's Frontend API by HOST. (The local bundle has a chunk named
  // clerk-*.js on 127.0.0.1, which must still load.)
  await page.route(/^https?:\/\/[^/]*clerk[^/]*\//i, (r) => r.abort())
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname !== '127.0.0.1') {
      external.push(u.hostname)
      return route.abort()
    }
    return route.fallback()
  })
  await page.goto('./')
  return { apiHits, external }
}

test('anonymous visitor works in the grid with Clerk blocked and calls no backend', async ({ page }) => {
  const { apiHits, external } = await openAnon(page)

  // (a) grid visible without sign-in
  await expect(page.getByRole('grid', { name: 'Spreadsheet grid' })).toBeVisible({ timeout: 10_000 })

  // (g) a Sign in button is offered
  await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible()

  // (b) import + deterministic auditor
  await importBudgetXlsx(page)
  await expect(cell(page, 'B5')).toContainText('1700')
  await expect(page.getByText('#DIV/0! in B6').first()).toBeVisible()

  // (c) persistence across reload
  await page.waitForTimeout(1200)
  await page.reload()
  await expect(cell(page, 'B5')).toContainText('1700')

  // (d) chat: LLM turn gets the sign-in message and button, no request
  await page.getByRole('button', { name: 'Open Chat panel' }).click()
  await page.getByRole('textbox', { name: 'Message the AI assistant' }).fill(CHAT_PROMPT)
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText(/needs a free account/i).first()).toBeVisible()

  // (e) cloud picker shows the sign-in state
  await page.getByRole('button', { name: /cloud/i }).first().click()
  await expect(page.getByText('Sign in to access cloud workbooks')).toBeVisible()

  // (f) zero backend requests. Off-machine requests are only Clerk (blocked) and
  // the pre-existing Google Fonts stylesheet in index.html (third party, not our
  // backend; aborted here too).
  expect(apiHits).toEqual([])
  for (const host of external) expect(host).toMatch(/clerk|^fonts\.(googleapis|gstatic)\.com$/i)
})

test('sign-in dialog says Clerk is unavailable after the 8 s fallback', async ({ page }) => {
  await openAnon(page)
  await expect(page.getByRole('grid', { name: 'Spreadsheet grid' })).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(8_500)
  await page.getByRole('button', { name: 'Sign in' }).first().click()
  await expect(page.getByRole('dialog', { name: /sign in/i })).toBeVisible()
  await expect(page.getByText(/Sign-in is unavailable/)).toBeVisible()
})

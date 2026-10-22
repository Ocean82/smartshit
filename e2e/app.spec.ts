import { test, expect } from '@playwright/test'
import { cell, editCell, gotoApp, importBudgetXlsx, mockChatStream } from './helpers'

test.describe('smartsht E2E', () => {
  test('imports a budget xlsx and shows the SUM total', async ({ page }) => {
    await gotoApp(page)
    await importBudgetXlsx(page)
    // Formula engine must finish recalc after import.
    await expect(cell(page, 'B5')).toContainText('1700', { timeout: 20_000 })
  })

  test('opens the auditor with a finding after import', async ({ page }) => {
    await gotoApp(page)
    await importBudgetXlsx(page)
    // importOrchestration audits ~500ms after import; #DIV/0! is critical → panel opens.
    await expect(page.getByText('Health Score')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('#DIV/0! in B6').first()).toBeVisible()
  })

  test('copies and pastes a cell with the keyboard', async ({ page }) => {
    await gotoApp(page)
    await editCell(page, 'A1', 'hello-e2e')
    await expect(cell(page, 'A1')).toContainText('hello-e2e')

    await cell(page, 'A1').click()
    await page.keyboard.press('ControlOrMeta+c')
    await cell(page, 'B2').click()
    await page.keyboard.press('ControlOrMeta+v')

    await expect(cell(page, 'B2')).toContainText('hello-e2e', { timeout: 10_000 })
  })

  test('undoes a cell edit with Ctrl+Z', async ({ page }) => {
    await gotoApp(page)
    await editCell(page, 'A1', 'before-undo')
    await expect(cell(page, 'A1')).toContainText('before-undo')

    await cell(page, 'A1').click()
    await page.keyboard.press('ControlOrMeta+z')

    await expect(cell(page, 'A1')).not.toContainText('before-undo', { timeout: 10_000 })
  })

  test('shows a mocked chat reply', async ({ page }) => {
    const reply = await mockChatStream(page)
    await gotoApp(page)

    await page.getByRole('button', { name: 'Open Chat panel' }).click()
    const input = page.getByRole('textbox', { name: 'Message the AI assistant' })
    await expect(input).toBeVisible()
    // Unique phrasing so local capability / template routers do not claim it.
    await input.fill('E2E probe: reply only with the mock token please')
    await page.getByRole('button', { name: 'Send message' }).click()

    await expect(page.getByText(reply)).toBeVisible({ timeout: 30_000 })
  })
})

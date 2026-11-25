/**
 * Real-browser guards for the keyboard, autocomplete and status-bar fixes:
 * things unit tests cannot see (focus, popup position, key handling).
 */
import { expect, test } from '@playwright/test'
import { cell, editCell, gotoApp } from './helpers'

test('keyboard works on a fresh sheet without a first click', async ({ page }) => {
  await gotoApp(page)
  await page.getByRole('grid', { name: 'Spreadsheet grid' }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect(cell(page, 'B2')).toHaveAttribute('aria-selected', 'true')
})

test('formula autocomplete sits near the cell and Esc cancels the edit', async ({ page }) => {
  await gotoApp(page)
  await cell(page, 'C3').click()
  await page.keyboard.type('=SU')
  const popup = page.getByText('Tab or Enter to insert').locator('xpath=ancestor::div[contains(@class,"fixed")][1]')
  await expect(popup).toBeVisible()
  const box = await popup.boundingBox()
  expect(box?.y ?? 0).toBeGreaterThan(40)
  expect(box?.x ?? 0).toBeGreaterThan(40)
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)
  await expect(cell(page, 'C3')).not.toContainText('=SU')
  // Focus returns to the grid, so arrows keep working.
  await page.keyboard.press('ArrowDown')
  await expect(cell(page, 'C4')).toHaveAttribute('aria-selected', 'true')
})

test('Ctrl+/ opens the shortcuts dialog and Esc closes it', async ({ page }) => {
  await gotoApp(page)
  await cell(page, 'A1').click()
  await page.keyboard.press('Control+/')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('Shift+F10 opens the cell context menu from the keyboard', async ({ page }) => {
  await gotoApp(page)
  await cell(page, 'B2').click()
  await page.keyboard.press('Shift+F10')
  await expect(page.getByLabel('Cell actions for B2')).toBeVisible()
})

test('status bar shows autosave state and select-all stats stay fast', async ({ page }) => {
  await gotoApp(page)
  await editCell(page, 'A1', '1')
  await editCell(page, 'A2', '2')
  await expect(page.getByText('Saved locally')).toBeVisible()
  await cell(page, 'A1').click()
  await page.keyboard.press('Control+a')
  // The mobile strip and the desktop bar both mount; only one is visible.
  await expect(page.locator('span:visible', { hasText: 'Sum: 3' })).toBeVisible({ timeout: 3_000 })
})

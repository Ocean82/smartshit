/**
 * Real-browser checks for behavior unit tests cannot see: the per-file workbook
 * model with Trash, folders (drag and Move menu), and the import overlays on a
 * phone-width screen. Each of these shipped a bug that only showed in a browser
 * (a drop on a file moved it to the top level; the summary card covered the
 * auditor's findings), so they stay as regression guards.
 */
import { expect, test, type Page } from '@playwright/test'
import { BUDGET_XLSX, cell, editCell, gotoApp, mockServerHealth, seedDismissedWelcome } from './helpers'

/** A row in the file list (its text is just the name; the action buttons are icons). */
const row = (page: Page, name: string) =>
  page.locator('div[role="button"]').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) })

async function openFileExplorer(page: Page) {
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByText('File Explorer', { exact: false }).first().click()
  await expect(page.getByTitle('New Folder', { exact: true })).toBeVisible()
}

async function newWorkbook(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('New Workbook', { exact: true }).first().click()
}

test('files: New Workbook keeps the open file, delete goes to Trash and restores', async ({ page }) => {
  await gotoApp(page)
  await editCell(page, 'A1', 'alpha')
  await openFileExplorer(page)

  await newWorkbook(page)
  await expect(page.getByText('2 files')).toBeVisible()
  await expect(cell(page, 'A1')).not.toContainText('alpha')

  await row(page, 'My Budget').click()
  await expect(cell(page, 'A1')).toContainText('alpha')

  await row(page, 'New Workbook').hover()
  await page.getByLabel('Delete New Workbook').click()
  await page.getByRole('button', { name: 'Move to Trash' }).click()
  await expect(page.getByText('Trash (1)')).toBeVisible()
  await expect(page.getByText('1 file', { exact: true })).toBeVisible()

  await page.getByText('Trash (1)').click()
  await page.getByLabel('Restore New Workbook').click()
  await expect(page.getByText('Trash (1)')).toHaveCount(0)
  await expect(page.getByText('2 files')).toBeVisible()
})

test('files: folders hold files via the folder button, drag and the Move menu', async ({ page }) => {
  await gotoApp(page)
  await openFileExplorer(page)
  const indent = (name: string) => row(page, name).evaluate((el) => (el as HTMLElement).style.paddingLeft)

  await page.getByTitle('New Folder', { exact: true }).click()
  await page.getByLabel('New folder name').fill('Clients')
  await page.getByLabel('New folder name').press('Enter')
  await row(page, 'Clients').hover()
  await page.getByLabel('New file in Clients').click()
  await page.getByLabel('New file name').fill('Acme')
  await page.getByLabel('New file name').press('Enter')
  expect(await indent('Acme')).toBe('20px')

  await page.getByTitle('New File', { exact: true }).click()
  await page.getByLabel('New file name').fill('Globex')
  await page.getByLabel('New file name').press('Enter')
  expect(await indent('Globex')).toBe('8px')
  await row(page, 'Globex').dragTo(row(page, 'Clients'))
  expect(await indent('Globex')).toBe('20px')

  // Dropping a file on another file must not move it (it once fell through to "top level").
  await row(page, 'Acme').dragTo(row(page, 'Globex'))
  expect(await indent('Acme')).toBe('20px')

  await row(page, 'Globex').hover()
  await page.getByLabel('Move Globex', { exact: true }).click()
  await page.getByLabel('Move Globex to').selectOption({ label: 'Top level' })
  expect(await indent('Globex')).toBe('8px')

  await row(page, 'Clients').hover()
  await page.getByLabel('Delete Clients').click()
  await expect(page.getByText(/and the 1 item in it/)).toBeVisible()
  await page.getByRole('button', { name: 'Move to Trash' }).click()
  await expect(page.getByText('Acme', { exact: true })).toHaveCount(0)
  await page.getByText('Trash (1)').click()
  await page.getByLabel('Restore Clients').click()
  await expect(page.getByText('Acme', { exact: true })).toBeVisible()
})

test('files: a folder can be created inside a folder', async ({ page }) => {
  await gotoApp(page)
  await openFileExplorer(page)
  await page.getByTitle('New Folder', { exact: true }).click()
  await page.getByLabel('New folder name').fill('Clients')
  await page.getByLabel('New folder name').press('Enter')
  await row(page, 'Clients').hover()
  await page.getByLabel('New folder in Clients').click()
  await page.getByLabel('New folder name').fill('2026')
  await page.getByLabel('New folder name').press('Enter')
  await expect(row(page, '2026')).toBeVisible()
  expect(await row(page, '2026').evaluate((el) => (el as HTMLElement).style.paddingLeft)).toBe('20px')
})

test('files: open and closed folders are remembered after a reload', async ({ page }) => {
  await gotoApp(page)
  await openFileExplorer(page)
  await page.getByTitle('New Folder', { exact: true }).click()
  await page.getByLabel('New folder name').fill('Clients')
  await page.getByLabel('New folder name').press('Enter')
  await row(page, 'Clients').hover()
  await page.getByLabel('New file in Clients').click()
  await page.getByLabel('New file name').fill('Acme')
  await page.getByLabel('New file name').press('Enter')
  await expect(row(page, 'Acme')).toBeVisible() // the folder opened itself

  await page.waitForTimeout(1500) // autosave of the file list
  await page.reload()
  await expect(page.getByRole('grid', { name: 'Spreadsheet grid' })).toBeVisible()
  await openFileExplorer(page)
  await expect(row(page, 'Acme')).toBeVisible() // still open

  await row(page, 'Clients').click() // close it
  await expect(row(page, 'Acme')).toHaveCount(0)
  await page.waitForTimeout(1500)
  await page.reload()
  await expect(page.getByRole('grid', { name: 'Spreadsheet grid' })).toBeVisible()
  await openFileExplorer(page)
  await expect(row(page, 'Clients')).toBeVisible()
  await expect(row(page, 'Acme')).toHaveCount(0) // still closed
})
/** A minimal smartsht JSON backup whose A1 holds `value`. */
function backupJson(value: string): Buffer {
  const sheet = { id: 's1', name: 'Sheet1', cells: { A1: { value } }, columnWidths: {}, rowHeights: {}, charts: [] }
  const workbook = { id: 'backup-wb', name: 'Old name', sheets: [sheet], activeSheetId: 's1', createdAt: 1, updatedAt: 1 }
  return Buffer.from(JSON.stringify({ version: 1, type: 'smartsht-workbook', exportedAt: 1, workbook }))
}

test('restore from JSON: the command palette asks first, and the restore can be undone', async ({ page }) => {
  await gotoApp(page)
  await editCell(page, 'A1', 'alpha')

  await page.keyboard.press('Control+k')
  await page.getByLabel('Search commands').fill('restore workbook from json')
  await page.keyboard.press('Enter')

  // It used to replace the workbook with no question and no way back.
  const confirm = page.locator('dialog.confirm-dialog')
  await expect(confirm.getByText('Restore from backup')).toBeVisible()
  await expect(cell(page, 'A1')).toContainText('alpha')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(cell(page, 'A1')).toContainText('alpha')

  await page.keyboard.press('Control+k')
  await page.getByLabel('Search commands').fill('restore workbook from json')
  await page.keyboard.press('Enter')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('dialog.confirm-dialog').getByRole('button', { name: 'Restore' }).click(),
  ])
  await chooser.setFiles({ name: 'backup.smartsht.json', mimeType: 'application/json', buffer: backupJson('restored') })
  await expect(cell(page, 'A1')).toContainText('restored')

  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('Control+z')
  await expect(cell(page, 'A1')).toContainText('alpha')
})

test('make a copy: a shared workbook opens as a new file and leaves the open one alone', async ({ page }) => {
  await seedDismissedWelcome(page)
  await mockServerHealth(page)
  await page.goto('./')
  await expect(page.getByRole('grid', { name: 'Spreadsheet grid' })).toBeVisible()
  await editCell(page, 'A1', 'alpha')
  await page.waitForTimeout(1500) // autosave

  const shared = JSON.parse(backupJson('from a shared link').toString()).workbook
  shared.name = 'Team budget'
  await page.evaluate((wb) => localStorage.setItem('smartsht-import-shared', JSON.stringify(wb)), shared)
  await page.reload()
  await expect(page.getByRole('grid', { name: 'Spreadsheet grid' })).toBeVisible()
  await expect(cell(page, 'A1')).toContainText('from a shared link')

  await openFileExplorer(page)
  await expect(row(page, 'Team budget')).toBeVisible()
  await row(page, 'My Budget').click()
  await expect(cell(page, 'A1')).toContainText('alpha') // the work that was open is intact
  expect(await page.evaluate(() => localStorage.getItem('smartsht-import-shared'))).toBeNull()
})
test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 700 } })

  test('the import summary card stays off the auditor, with no duplicate toast, and returns after', async ({ page }) => {
    await gotoApp(page)
    await page.locator('input[aria-label="Import spreadsheet file"]').first().setInputFiles(BUDGET_XLSX)
    // The #DIV/0! cell opens the auditor on its own.
    await expect(page.getByText('Health score', { exact: false }).first()).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500)

    const summary = page.getByRole('complementary', { name: 'Import insights summary' })
    await expect(summary).toHaveCount(0)
    await expect(page.getByText(/^Auditor found/)).toHaveCount(0)

    await page.getByRole('button', { name: /close/i }).first().click()
    await expect(summary).toBeVisible()
  })

  test('the Open dialog fits the screen', async ({ page }) => {
    await gotoApp(page)
    await editCell(page, 'A1', 'alpha')
    await page.getByRole('button', { name: /menu/i }).first().click()
    await page.getByText(/^(Import|Open)/).first().click()
    const dialog = page.locator('dialog.confirm-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Open as new file' })).toBeVisible()
    await page.waitForTimeout(600) // let the fade-in finish before measuring
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  })
})

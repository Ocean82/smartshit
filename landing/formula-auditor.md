---
title: "Free Excel Formula Checker & Spreadsheet Auditor | smartsh!t"
description: "Find errors in an Excel spreadsheet: skipped SUM cells, #REF! errors, inconsistent formulas, circular references. Runs in your browser. Free, no account."
image: "https://smartsht.com/og-image.png"
---

[← Back to smartsht.com](https://smartsht.com/)

# Formula auditor and Excel error checker

Runs in the browser. No account required to scan.

The smartsht formula auditor is a free spreadsheet audit tool and Excel formula checker. It reads an Excel or CSV file and flags formula mistakes that still look correct: a SUM that skips a row, a column where one formula does not match the others, a cell that shows #REF! or #DIV/0!, a number that is far from the rest, a circular reference, or a hardcoded number buried in a formula. The check runs on your machine. The file is not uploaded for the scan.

## What it looks for

- **Formula errors.** Cells that show #REF!, #DIV/0!, #VALUE!, #N/A, #NAME? or #NUM!, with a plain reason and a suggested fix.
- **Range gaps.** A SUM that stops short of the last value, such as a total that skips the row above it.
- **Inconsistent formulas.** A column of formulas where one cell was typed differently from the rest.
- **Circular references.** A formula that depends on its own result.
- **Outliers.** A value far from the rest of the column, which is often a typo or a unit mismatch.
- **Hardcoded numbers.** A number typed inside a formula, such as `=B2*4817`, that belongs in its own input cell.
- **Cross-sheet links.** Formulas that read from another sheet and break silently if that sheet is renamed or deleted.
- **Volatile functions.** NOW, TODAY, RAND, INDIRECT and OFFSET, which recalculate on every change or break when rows move.
- **Duplicate formulas.** The same formula pasted unchanged into several cells.
- **Your own rules.** Add a rule for a column, such as column B must be greater than 0, and it runs with the rest.

## Review findings your way

Dismiss a finding you have checked and it stays hidden until one of its cells changes. Each finding is dismissed on its own, so keeping one does not keep the others. Dismissed findings stay listed so you can restore them. You can also turn the auditor off, and back on later, whenever you like.

## What a scan does not do

It does not prove the business logic is right. A budget can add up and still use the wrong rent. It also does not replace Excel's own error checker for every desktop feature. Imported .xlsx formulas keep Excel's saved values until you edit the cell, so a scan is a check of the sheet smartsht can see, not a guarantee that every legacy add-in still behaves the same way.

## Fixing what it finds

You can apply a suggested fix yourself, or ask the assistant to fix it. By default you see the change before it lands. Auto mode applies low-risk edits and can be undone. The Free plan includes auditor scans and 3 lifetime auto-fixes. Pro ($7/month at the early adopter rate, or $59/year) includes unlimited auto-fix.

An AI question is separate from the scan. The auditor stays local. A question sends that question and a summary of the cells it needs to our server, or to your own provider if you bring an API key.

## Share the audit report

Export the scan as a single HTML report with the health score, each finding, the cells involved, and a suggested fix. Open it in any browser, or print it to PDF to send to a manager, client or teammate. The report is built on your machine and the file is not uploaded. Reports from the Free plan end with a short smartsh!t footer. Pro reports leave it out.

## How to check an Excel file for errors

1. Open smartsht and import an .xlsx, .xls or CSV file. From Google Sheets, use File, Download, Microsoft Excel (.xlsx) first.
2. Open the Auditor. The scan runs in your browser and needs no account.
3. Read each finding and click a cell reference to jump to it. Fix it yourself, apply the suggested fix after you see the preview, or dismiss it.

[Audit an Excel file](https://smartsht.com/app?audit=1)

## Frequently asked questions

### How do I check an Excel file for formula errors?

Import the file into smartsht and open the Auditor. It scans the sheet you have open for error values such as #REF! and #DIV/0!, skipped ranges, inconsistent formula patterns, circular references and hardcoded numbers. The scan runs in your browser and needs no account.

### Is the formula auditor free?

Yes. Scans are free and need no account. The Free plan includes 3 lifetime auto-fixes. Pro, at $7/month (early adopter rate) or $59/year, includes unlimited auto-fix.

### Is my spreadsheet uploaded when I audit it?

No. The audit runs in your browser and the file is not uploaded for the scan. An AI question is separate: it sends the question and a summary of the cells it needs to our server, or to your own provider if you bring an API key.

### Can I audit a Google Sheets file?

Yes. Download the sheet from Google Sheets as an .xlsx or CSV file, then open it in smartsht.

### Can I send the audit results to someone else?

Yes. Export a single HTML report with the score and every finding, then open it in a browser or print it to PDF.

### What can the auditor not catch?

It checks how the sheet is built, not whether the numbers mean the right thing. A budget can add up and still use the wrong rent.

## Related

See how smartsht compares with Excel and Google Sheets on the [Excel alternative](https://smartsht.com/excel-alternative) page, read about [pricing](https://smartsht.com/#pricing), or go back to the [homepage](https://smartsht.com/).

```json
{"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":"https://smartsht.com/formula-auditor#webpage","url":"https://smartsht.com/formula-auditor","name":"Free Excel Formula Checker & Spreadsheet Auditor | smartsh!t","description":"Find errors in an Excel spreadsheet: skipped SUM cells, #REF! errors, inconsistent formulas, circular references. Runs in your browser. Free, no account.","isPartOf":{"@id":"https://smartsht.com/#website"},"about":{"@id":"https://smartsht.com/#app"},"dateModified":"2026-11-21","inLanguage":"en-US","breadcrumb":{"@id":"https://smartsht.com/formula-auditor#breadcrumb"}},{"@type":"BreadcrumbList","@id":"https://smartsht.com/formula-auditor#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://smartsht.com/"},{"@type":"ListItem","position":2,"name":"Formula auditor","item":"https://smartsht.com/formula-auditor"}]},{"@type":"FAQPage","@id":"https://smartsht.com/formula-auditor#faq","isPartOf":{"@id":"https://smartsht.com/formula-auditor#webpage"},"mainEntity":[{"@type":"Question","name":"How do I check an Excel file for formula errors?","acceptedAnswer":{"@type":"Answer","text":"Import the file into smartsht and open the Auditor. It scans the sheet you have open for error values such as #REF! and #DIV/0!, skipped ranges, inconsistent formula patterns, circular references and hardcoded numbers. The scan runs in your browser and needs no account."}},{"@type":"Question","name":"Is the formula auditor free?","acceptedAnswer":{"@type":"Answer","text":"Yes. Scans are free and need no account. The Free plan includes 3 lifetime auto-fixes. Pro, at $7/month (early adopter rate) or $59/year, includes unlimited auto-fix."}},{"@type":"Question","name":"Is my spreadsheet uploaded when I audit it?","acceptedAnswer":{"@type":"Answer","text":"No. The audit runs in your browser and the file is not uploaded for the scan. An AI question is separate: it sends the question and a summary of the cells it needs to our server, or to your own provider if you bring an API key."}},{"@type":"Question","name":"Can I audit a Google Sheets file?","acceptedAnswer":{"@type":"Answer","text":"Yes. Download the sheet from Google Sheets as an .xlsx or CSV file, then open it in smartsht."}},{"@type":"Question","name":"Can I send the audit results to someone else?","acceptedAnswer":{"@type":"Answer","text":"Yes. Export a single HTML report with the score and every finding, then open it in a browser or print it to PDF."}},{"@type":"Question","name":"What can the auditor not catch?","acceptedAnswer":{"@type":"Answer","text":"It checks how the sheet is built, not whether the numbers mean the right thing. A budget can add up and still use the wrong rent."}}]}]}
```

# Task 5 Report: Formula Autocomplete Popup Component

## Status: DONE

## Summary

Created `src/components/FormulaAutocomplete.tsx` — a popup that appears when a user types `=` in a cell, showing filtered function suggestions with full keyboard and mouse navigation.

## What Was Built

- **Component**: `FormulaAutocomplete` — accepts `visible`, `editValue`, `onSelect`, and `position` props
- **Function list source**: `engine.getFunctionList()` from the Zustand store (returns 37 built-in functions)
- **Filtering**: Regex extracts the function name being typed after `=`, filters functions by prefix match, caps at 12 results
- **Keyboard nav**: ArrowUp/Down to navigate, Tab/Enter to select, Escape to dismiss — all via `document.addEventListener` with capture phase
- **Mouse nav**: Hover to highlight, click (onMouseDown with preventDefault) to select
- **Auto-scroll**: Scrolls selected item into view via `scrollIntoView({ block: 'nearest' })`
- **Styling**: Tailwind classes — fixed positioned popup (340px wide, 280px max height), blue highlight for selected item, monospace function names, truncated descriptions

## Test Results

All 14 tests pass (6 test files, unchanged from prior tasks):
- `intentParser.test.ts` — 2 tests
- `shared/intentParser.test.ts` — 2 tests  
- `budget.test.ts` — 3 tests
- `sheetProfile.test.ts` — 2 tests
- `queryEngine.test.ts` — 4 tests
- `brain.test.ts` — 1 test

## Pre-existing TypeScript Errors

There are pre-existing TS errors in `brain.test.ts`, `buildContext.ts`, and `queryEngine.test.ts` unrelated to this component. The new `FormulaAutocomplete.tsx` introduces no new errors.

## Commit

`26c0bed` — feat: add FormulaAutocomplete popup component

## Concerns

None. Component matches the spec exactly and integrates cleanly with the existing store/engine.

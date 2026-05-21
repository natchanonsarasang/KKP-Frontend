## Goal
Add a new `overdue_installments` field (number input) to the debtor variables system. It appears in the Add/Edit form as a numeric input, in the downloadable Excel template, and is recognized during Excel import — all stored inside `debtors.variables` (no DB schema change).

## Changes

### 1. `src/lib/debtorVariables.ts`
- Append `"overdue_installments"` to `DEBTOR_CUSTOMER_VARIABLE_KEYS`.
- Add `overdue_installments: "Overdue Installments"` to `DEBTOR_CUSTOMER_VARIABLE_LABELS`.

This cascades into the import validator and template-header generator automatically, since both iterate over `DEBTOR_CUSTOMER_VARIABLE_KEYS`.

### 2. `src/components/DebtorsList.tsx` — Add/Edit Debtor dialog
The existing dynamic loop renders all generic keys as `<Input>` (text). To make `overdue_installments` a number input without disturbing the layout, render it with `type="number"`, `min="0"`, `step="1"` inside the same loop (small conditional on `key === "overdue_installments"`). The value is still stored as a string in `templateVariables` and persisted into `variables` JSON exactly like the other fields — keeping submit/payload logic untouched.

### 3. `src/components/DebtorExcelUpload.tsx`
- Add a sample value for the new column in `downloadTemplate()`'s switch (e.g. `case "overdue_installments": return "2";`) so the downloaded template shows a realistic numeric example.
- Import parsing already handles arbitrary string values per key, so no extra validation branch needed; numeric content from the cell is captured as-is.

## Out of scope
- No DB migration — value lives in existing `variables` JSONB.
- No changes to voicebot call payload, templates, or unrelated form fields/layout.
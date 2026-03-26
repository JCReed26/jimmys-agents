---
name: budget-tasks
description: Routine budget data entry — log an expense, record income, add a new tab, or recalculate summaries. Use for any day-to-day operation on existing CSV files.
---

# Budget Tasks

## Add an Expense
1. Parse: amount, merchant, category, date (default today)
2. If category is unclear, ask — don't guess
3. Read then append to `data/Expenses.csv`: `YYYY-MM-DD, category, subcategory, amount, merchant, notes`
4. Confirm: "Added $X to [category] on [date]"

## Add Income
1. Parse: amount, source, date, frequency if recurring
2. Read then append to `data/Income.csv`: `YYYY-MM-DD, source, amount, frequency, notes`
3. Confirm

## Add a New Tab
1. Confirm name and purpose
2. Create `data/<name>.csv` with appropriate headers

## Recalculate / Update Summaries
1. Read relevant CSVs
2. Recompute totals and variances
3. Update `data/Budget.csv` and `data/Dashboard.csv`

## Rules
- Always read before writing — never overwrite blindly
- Amounts are always positive; category determines income vs expense
- Dates: `YYYY-MM-DD`, default to today

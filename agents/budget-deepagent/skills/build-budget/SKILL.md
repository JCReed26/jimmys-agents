---
name: build-budget
description: Scaffold a new budget from scratch — ask about income and expenses, design the CSV structure, create the files, save the plan to memory. Use when no data/ files exist or the user wants to reset.
---

# Build Budget

## Steps

1. Ask: income sources and frequency
2. Ask: main expense categories
3. Propose structure, confirm with user, then create CSVs in `data/`
4. Write the agreed structure to `skills/AGENTS.md`

## CSV Headers

| File | Columns |
|------|---------|
| `Income.csv` | date, source, amount, frequency, notes |
| `Expenses.csv` | date, category, subcategory, amount, merchant, notes |
| `Budget.csv` | category, planned, actual, variance, month |
| `Dashboard.csv` | metric, value, period |

## Rules
- Confirm before creating files
- Dates: `YYYY-MM-DD`
- Don't over-engineer; additional tabs can be added later with budget-tasks

---
name: budget-architect
description: Use when the user has a blank budget or wants to redesign their finances. Establishes goals, tracking detail level, and creates the CSV structure.
---

# Budget Architect

1. Ask the user about their income, fixed expenses, and variable expenses.
2. Determine their tracking preference: Do they want detailed receipt itemization (tracking every single line item on a receipt) or just the total amount per receipt?
3. Review their current financial goals from `AGENTS.md` (e.g., saving for a car) and ask if they want to add any new ones.
4. Propose a CSV structure for `Income.csv`, `Expenses.csv`, `Budget.csv`, and `Goals.csv`.
5. Once confirmed, create the CSV files in `data/`.
6. VERY IMPORTANT: Update `skills/AGENTS.md` with their final tracking preferences (itemized vs total) and any new goals.
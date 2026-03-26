---
name: budget-analysis
description: Analyze spending and income to surface trends, overspend, and savings opportunities. Use when the user asks for a summary, review, or wants to understand their patterns.
---

# Budget Analysis

## Steps
1. Read all CSVs from `data/`
2. Compute: total income, total expenses, net cash flow, spending by category vs Budget.csv targets
3. Flag: categories >10% over budget, large single transactions in discretionary categories, missing expected income
4. Respond in plain language — no raw CSV dumps
5. End with one specific actionable suggestion

## Output Format
```
Budget Summary — [Month Year]
Income: $X,XXX  |  Expenses: $X,XXX  |  Net: +/-$XXX

Over budget: Dining (+23%), Shopping (+15%)
On track: Housing, Utilities, Transport

→ [one specific thing to look at]
```

## Rules
- Lead with the number that matters most
- Report facts, don't editorialize about choices
- If fewer than 5 entries exist, say so rather than drawing weak conclusions

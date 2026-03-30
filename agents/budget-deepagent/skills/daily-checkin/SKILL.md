---
name: daily-checkin
description: Run this daily to process new bank transactions, process receipts, and provide a daily digest.
---

# Daily Check-in & Receipt Processing

1. Check `skills/AGENTS.md` to determine the user's receipt processing preference (Itemized vs. Total).
2. Fetch new Fintable/Plaid transactions using your tools and look at any uploaded receipts.
3. For receipts: If preference is "Total", just extract the total and categorize. If "Itemized", extract each line item and categorize them individually.
4. Categorize all new transactions and write them to `data/Expenses.csv`.
5. If you are unsure about a category, use your HITL tool to ask the user. DO NOT GUESS.
6. Provide a concise Daily Digest: 
   - Summarize what was processed.
   - Show current spending vs. budget.
   - If they overspent in a category, creatively insult them for their lack of discipline, then immediately move on to the rest of the digest.
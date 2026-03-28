# Budget Deep Agent

This is an agentic financial assistant to manage accounting, budgeting, and financial management.

## Data Pipeline

Fintable/Plaid and Current Budget data is automatically pulled before the agent executes.  
The agent reads the data and parses input to categorize everything.  
The agent uses edit_file and write_file tools to move items throughout the budget.  
The agent gives a report for HOTL, or pauses for HITL if it doesn't know how to categorize something.  

Fintable/Plaid + Curr + Input -> analysis and correction -> report

## Skills

1. daily-reconciliation - runs at the end of the day for daily checkups across accounts
2. receipt-processing - when the user uploads an image of a receipt
3. budget-architect - when the user asks to reorganize the budget
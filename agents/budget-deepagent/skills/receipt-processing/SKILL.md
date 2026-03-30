---
name: receipt-processing
description: Use when processing a receipt to retrieve the information
---
# Receipt Processing Instructions

Get these data points:

1. Establishment - where the purchase was made
2. Total Amount - the final amount that was paid

## Special Cases

Check `AGENTS.md` if the user has a specific budget that calls for an itemized breakdown of a certain category follow these steps:

1. check to see if the establishment falls under the category that is being itemized
2. if it falls under the category grab these data points:

- item
- amount
- item_category

3. collect each item into a list and save to the budget
4. perform refresh of all analytical datapoints being tracked and or calculated based on the data
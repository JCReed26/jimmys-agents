# Budget Agent

Langgraph agent plan

to mermaid diagram  
Access-Points: chat-question or chat-receipt-photo 
chat-question: queries the information to find answer or gather response, can also reply with a chart  
chat-receipt-photo: send a photo of a receipt, extract the data, human-approval-node, add to budget

budget-tracking: connected to google sheets

Build a budget management agent that utilizes Google Sheets as its database and the UI. Base UI. Look online for google sheets budgeting templates that have The user through chat, will send either text or an image to a multi-modal input model. The agent will have the ability to:
1. take a blank sheet and create each section of the budgets needs utilizing header colors and incorporating graphs where applicable. 
2. enter receipts and text entries of money spent into the budget
3. enter screenshots and text entries of money income into a bank account and into the budget
4. manage multiple accounts (discover card, usaa debit, usaa debit2, sofi debit, sofi savings, usaa savings) 
5. manage yearly and monthly budgets, track by week 52 in 1 year
6. every sunday automatically run a budget review to track spending look at trends, research new possible recurring expenses to understand them and place finding into a sheet specifically for these logs
The overall spreadsheet should use multiple sheets to separate different views but maintain context across sheets, each sheet should not be overwhelming with data but include a nice structure to present the data with labels, and show graphs with labels as well. 
Ask any other questions that would help determine a definitive path toward success.
# Gmail Reason-Action Agent

An autonomous agent that polls Gmail every 30 minutes to clean up your inbox and prepare replies for important messages.

## Features
- **Proactive Filtering**: Automatically identifies and marks "unnecessary" emails (newsletters, ads) as read.
- **Reasoning-Action (ReAct)**: Analyzes email content to determine if a reply is needed.
- **Drafting**: Generates suggested replies for messages requiring a response.
- **Folder Support**: Scans both Inbox and Trash to ensure nothing is missed.
- **Polling**: Runs as a background service with a 30-minute interval.

## Setup
1. **Credentials**: Ensure `credentials.json` is in the root and `token.json` is generated via the OAuth flow.
2. **Environment**:
   - `GOOGLE_API_KEY`: For the Gemini LLM.
3. **Dependencies**: `pip install -r requirements.txt`

## Logic Flow
1. **Search**: Agent queries Gmail for recent messages.
2. **Analysis**: LLM determines the `ActionType` (READ vs REPLY).
3. **Execution**: 
   - Calls `mark_emails_as_read` for noise.
   - Calls `format_email_output` for the user report.
4. **Sleep**: Waits 30 minutes before the next cycle.
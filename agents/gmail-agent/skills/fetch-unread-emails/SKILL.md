---
name: fetch-unread-emails
description: Use when the user or you need to see the inbox 
---
# Skill: Fetching Unread Emails

**Purpose:** How to retrieve and parse unread emails from the inbox.

**Instructions:**
1. Use the `search_gmail` tool with the query parameter set to `"is:unread in:inbox"`.
2. This will return a list of basic message metadata.
3. To parse the full context (senders, subjects, and body text), use the `get_gmail_thread` tool passing the `thread_id` from the search results.
4. Evaluate the thread's contents to determine if the email is high priority (requires a draft/task) or spam/noise (can be ignored).
---
name: create-gmail-draft
description: Use when the user needs to respond to an email or is writing an email
---
# Skill: Creating Gmail Drafts

**Purpose:** How to prepare responses for high-priority emails.

**CRITICAL RULE:** You are in Draft-Only mode. NEVER use the `send_gmail_message` tool.

**Instructions:**
1. Once you determine an email requires a reply, formulate a helpful, professional response.
2. Use the `create_gmail_draft` tool.
3. You must provide the `message` (body), `to` (recipient array), `subject`, and the `thread_id` to ensure the draft threads correctly in Gmail.
4. Do not perform any further action on the email itself once the draft is created.

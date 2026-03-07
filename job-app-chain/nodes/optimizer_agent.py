"""
Optimizer Agent — uses deepagents to tailor resumes and cover letters for approved jobs.

Pipeline per job:
  1. Research company (research-agent subagent)
  2. Download resume template from Drive, fill with job-specific content
  3. Download cover letter template from Drive, fill with personalized content
  4. Grammar check both documents (grammar-agent subagent)
  5. Final proofread (proofreader-agent subagent)
  6. Upload both to Drive output folder
  7. Return Drive URLs + research brief in state
"""

import os
from datetime import datetime

from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model
from dotenv import load_dotenv

from state import JobAppState, OptimizedJob, OptimizedStatus
from nodes.optimizer_tools import download_drive_template, upload_to_drive, fill_docx_template
from nodes.optimizer_subagents import research_agent, grammar_agent, proofreader_agent

load_dotenv()

SYSTEM_PROMPT = """You are a job application optimizer. For each job you receive, complete these steps in order:

1. write_todos: Plan your work with these items:
   - research_company
   - download_resume_template
   - fill_resume
   - download_cover_letter_template
   - fill_cover_letter
   - grammar_check
   - proofread
   - upload_documents

2. Delegate company research to research-agent: provide the company name and job URL.
   Use the returned research brief to personalize all documents.

3. Download resume template using the RESUME_TEMPLATE_DRIVE_ID env var.

4. Fill the resume template with job-specific content using fill_docx_template.
   Replace placeholders: {{JOB_TITLE}}, {{COMPANY}}, {{KEY_REQUIREMENTS}}, {{RESEARCH_HIGHLIGHTS}}.

5. Download cover letter template using the COVER_LETTER_TEMPLATE_DRIVE_ID env var.

6. Fill the cover letter template. Replace placeholders: {{JOB_TITLE}}, {{COMPANY}},
   {{COMPANY_RESEARCH}}, {{WHY_THIS_ROLE}}, {{KEY_SKILLS}}.

7. Delegate grammar checking to grammar-agent: pass both document texts.

8. Delegate final proofreading to proofreader-agent: pass both corrected documents.

9. Upload the final resume and cover letter to Drive using upload_to_drive with the
   DRIVE_OUTPUT_FOLDER_ID env var. Use filenames: "{company}_{title}_resume.docx" and
   "{company}_{title}_cover_letter.docx".

10. Return a JSON summary with: resume_url, cover_letter_url, research_brief.

Be concise and focused. Do not ask questions — make sensible decisions and proceed.
"""


def _build_optimizer_agent():
    model = init_chat_model(model="google-genai:gemini-2.5-flash", temperature=0)
    tools = [download_drive_template, upload_to_drive, fill_docx_template]
    return create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
        subagents=[research_agent, grammar_agent, proofreader_agent],
    )


def optimizer_node(state: JobAppState) -> JobAppState:
    """Runs the deep optimizer agent for each approved job."""
    print("--- Optimizer Node ---")
    approved_jobs = state.get("approved_jobs", [])
    if not approved_jobs:
        return {"optimized_jobs": []}

    agent = _build_optimizer_agent()
    optimized_jobs = []

    for job in approved_jobs:
        title = job.get("title", "Unknown")
        company = job.get("company", "Unknown")
        job_url = job.get("job_url", "")
        print(f"Optimizing: {title} at {company}")

        user_message = (
            f"Optimize application for: {title} at {company}\n"
            f"Job URL: {job_url}\n"
            f"Description: {job.get('description', '')[:2000]}"
        )

        try:
            result = agent.invoke({
                "messages": [{"role": "user", "content": user_message}]
            })

            # Extract the last assistant message as the result summary
            messages = result.get("messages", [])
            last_msg = next(
                (m for m in reversed(messages) if getattr(m, "type", None) == "ai"),
                None
            )
            content = last_msg.content if last_msg else ""

            # Parse URLs from response — agent should return them clearly
            resume_url = _extract_url(content, "resume_url") or "drive://pending"
            cover_letter_url = _extract_url(content, "cover_letter_url") or "drive://pending"
            research_brief = _extract_field(content, "research_brief") or content[:500]

            optimized_job = OptimizedJob(
                **job,
                resume_url=resume_url,
                cover_letter_url=cover_letter_url,
                reasoning=f"Optimized by deepagents for {title} at {company}.",
                research_brief=research_brief,
                optimized_status=OptimizedStatus.NEW,
                optimized_date=datetime.now().isoformat(),
            )
            optimized_jobs.append(optimized_job)
            print(f"  Resume: {resume_url}")
            print(f"  Cover letter: {cover_letter_url}")

        except Exception as e:
            print(f"  Failed to optimize {title}: {e}")
            continue

    return {"optimized_jobs": optimized_jobs}


def _extract_url(text: str, key: str) -> str:
    """Extract a URL value from a JSON-like key: value string."""
    import re
    pattern = rf'"{key}"\s*:\s*"([^"]+)"'
    match = re.search(pattern, text)
    return match.group(1) if match else ""


def _extract_field(text: str, key: str) -> str:
    """Extract a string field value from a JSON-like key: value string."""
    import re
    pattern = rf'"{key}"\s*:\s*"([^"]*)"'
    match = re.search(pattern, text, re.DOTALL)
    return match.group(1) if match else ""

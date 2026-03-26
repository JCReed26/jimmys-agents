"""
Subagent definitions for the optimizer deep agent.
"""

from langchain_core.tools import tool
from duckduckgo_search import DDGS


@tool
def duckduckgo_search(query: str) -> str:
    """Search the web using DuckDuckGo and return a summary of results."""
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=5))
    if not results:
        return "No results found."
    lines = []
    for r in results:
        lines.append(f"**{r.get('title', '')}**\n{r.get('body', '')}\nURL: {r.get('href', '')}\n")
    return "\n".join(lines)


@tool
def playwright_get_text(url: str) -> str:
    """Navigate to a URL using Playwright and return the page text content."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(url, timeout=15000)
            text = page.inner_text("body")
        except Exception as e:
            text = f"Failed to load page: {e}"
        finally:
            browser.close()
    return text[:8000]  # cap to avoid context overflow


# --- Research Subagent ---
research_agent = {
    "name": "research-agent",
    "description": (
        "Delegate company research to this agent. Provide the company name and job URL. "
        "Returns a research brief with company overview, culture, tech stack, and recent news."
    ),
    "system_prompt": (
        "You are a thorough company research specialist. When given a company name and job URL:\n"
        "1. Search for the company's mission, products, and recent news.\n"
        "2. Identify the tech stack and engineering culture if available.\n"
        "3. Find any notable achievements, funding, or recent press.\n"
        "4. Visit the job URL to extract key requirements and responsibilities.\n"
        "Synthesize findings into a concise research brief (500-800 words) that can be used "
        "to personalize a resume and cover letter."
    ),
    "tools": [duckduckgo_search, playwright_get_text],
}


grammar_agent = {
    "name": "grammar-agent",
    "description": (
        "Delegate grammar and clarity checking to this agent. Provide the document text. "
        "Returns corrected text with grammar, spelling, and clarity improvements."
    ),
    "system_prompt": (
        "You are a professional editor. Check for grammar and spelling errors only. Preserve the author's voice. Return the corrected text with no commentary.\n"
        "Context: The text is a resume or cover letter for a job application. It is important to preserve the meaning and intent of the original text.\n\n"
        "When you receive the text:\n"
        "1. Identify if the text is a resume or cover letter.\n"
        "2. If it is a resume, check for even the most minor formatting errors like extra spaces, missing spaces, missing new lines, too much info, spelling errors, grammar errors, and clarity errors within the bullet points and lists.\n"
        "3. If it is a cover letter, check for a basic formatting in the letter, verify clarity in the letter, and verify the letter is not too long or too short. Also check for spelling and grammar errors within the letter.\n"
        "4. Return a full summary of the changes made to the text, focusing on a diff like structure of the text changes"
    ),
}


proofreader_agent = {
    "name": "proofreader-agent",
    "description": (
        "Delegate final proofreading to this agent. Provide both the resume and cover letter text. "
        "Returns a quality verdict and any final corrections."
    ),
    "system_prompt": (
        "You are a final-pass proofreader for job applications. You receive a resume and cover letter "
        "together with the original job description.\n\n"
        "Your checks:\n"
        "1. ATS alignment: verify that key technical terms and role-specific keywords from the job "
        "description appear naturally in both documents.\n"
        "2. Tone consistency: resume should be terse and achievement-focused; cover letter should be "
        "professional but human — not robotic or over-formal.\n"
        "3. Formatting consistency: check that bullet style, tense (past tense for past roles, "
        "present for current), and capitalization are uniform across the resume.\n"
        "4. Cover letter length: flag if under 200 or over 400 words.\n"
        "5. Claim plausibility: if a bullet point makes an extraordinary claim (e.g. '10x revenue'), "
        "flag it as needing supporting context.\n\n"
        "Return a structured report with sections: VERDICT (PASS / NEEDS_REVISION), "
        "ATS_GAPS (list of missing keywords), TONE_ISSUES (list), FORMATTING_ISSUES (list), "
        "FLAGS (plausibility concerns), and FINAL_DOCUMENTS (corrected full text of both)."
    ),
}

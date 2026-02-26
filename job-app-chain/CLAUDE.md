# @job-app-chain

## Project Overview
A LangGraph v1 application that automates job application workflows using Google Sheets as the primary UI/Dashboard.
- **Goal:** Automate job scraping, qualification, and application prep (resume/cover letter optimization).
- **Schedule:** Runs ~every 12 hours via cron.
- **Architecture:** Parallel execution of scraping (external data) and sheet management (internal state).

## System Architecture

### 1. The Dashboard (Google Sheet)
The sheet acts as the state manager and UI.
- **Lock Mechanism:**
  - **Cell A1**: Status Indicator ("GREEN" = Idle/Editable, "RED" = Locked/Running).
  - **Cell A10**: "Job App Chain Dashboard" (Header).
- **Tabs:**
  1.  `job_inbox`: New scraped/classified jobs. Status: `New` -> `Approved` (moves to optimization) or `Rejected` (moves to rejected).
  2.  `optimized_jobs`: Jobs with generated assets. Status: `Ready to Review` -> `Applied` (moves to tracker) or `Decided Against` (moves to rejected).
  3.  `job_tracker`: Active applications.
  4.  `rejected`: Archive of rejected/decided against jobs.

### 2. The LangGraph Flow
**Graph Structure:**
1.  **Init & Lock Node**:
    - Locks sheet (Cell A1 -> RED).
    - Reads all existing URLs from all tabs (deduplication).
    - Reads current sheet state.
2.  **Parallel Branch Execution**:
    - **Branch A (Scraper)**:
        - `scrape_jobs`: Uses `jobspy` & `playwright` to find new listings.
        - `clean_data`: Normalizes data.
        - `classify_jobs`: Auto-tags/grades jobs.
    - **Branch B (Sheet Manager)**:
        - `process_inbox`: Identifies `Approved` jobs for optimization.
        - `process_optimized`: Moves `Applied` jobs to Tracker, `Decided Against` to Rejected.
        - `process_rejected`: Moves `Rejected` inbox items to Rejected tab.
3.  **Optimization Node**:
    - Input: `Approved` jobs from Branch B.
    - Action: Agent uses Google Docs templates to generate Resume & Cover Letter.
    - Output: Updates job object with Drive links and "Reasoning" comments.
4.  **Finalize Node**:
    - Writes new scraped jobs to `job_inbox`.
    - Updates `optimized_jobs` tab with new optimized entries.
    - Moves processed rows to `job_tracker` or `rejected`.
    - Unlocks sheet (Cell A1 -> GREEN).

## Data Types (TypedDict)

class JobDescription(TypedDict):
    id: str                 # Hash of URL
    title: str
    company: str
    url: str
    description: str        # Raw text
    status: str             # "new", "approved", "rejected", "applied", "decided_against"
    found_date: str

class JobApplication(JobDescription):
    resume_url: str         # Google Drive Link
    cover_letter_url: str   # Google Drive Link
    optimization_reasoning: str # Agent's logic for the changes
    application_status: str # "ready_for_review", "applied", "interviewing", etc.

### **Commands**
- **Install**: `pip install -r requirements.txt`
- **Run Graph**: `python main.py`
- **Test Node**: `pytest tests/test_nodes.py`

### **Coding Conventions**
- **Style**: Google Style Python Docstrings.
- **State**: Use TypedDict for all graph state.
- **Google Integration**:
  - Use langchain_google_community for Sheets/Drive.
  - Use gspread for low-level sheet manipulations if needed.
- **LLM**: ChatGoogleGenerativeAI (Gemini 2.5 Flash).
- **Error Handling**: Never crash the sheet lock. Ensure finally block always unlocks A1 (sets to GREEN) even on failure.

### **Development Status**
- [ ] **Scraper**: Needs jobspy config.
- [ ] **Optimization**: Needs Google Docs template integration.
- [ ] **Sheet**: Needs gspread auth setup

### **Design Notes & Reasoning**
1.  **Lock Mechanism (Cell A1)**: This is critical. The script *must* fail gracefully. If the script crashes halfway, the sheet might stay "Red". We should include a "Force Unlock" utility or a timeout in the script to prevent permanent lockout.
2.  **Parallelism**:
    - **Branch A (Scraper)** needs the *current* list of URLs (from the Init node) to avoid scraping duplicates.
    - **Branch B (Sheet Ops)** processes the *user's* changes (changing status from "New" to "Approved").
    - **Merge**: The `Finalize` node is responsible for ensuring row indices haven't shifted in a way that corrupts data, though reading the whole sheet at the start usually mitigates this if we rewrite or append carefully.
3.  **Optimization Agent**: You mentioned "making optimized based edits with comments including the reasoning."
    - We will store this `reasoning` in a column in the `optimized_jobs` tab so you can see *why* the AI made those changes.
4.  **Google Docs Templates**: The agent will need a specific Google Drive folder ID to look for templates and a destination folder to save the new files.

Does this structure align with your vision? If so, you can copy this directly into `@job-app-chain/CLAUDE.md`.
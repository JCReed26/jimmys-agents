# Implementation Plan: Job App Chain

This plan follows a standard SDLC approach: Requirements -> Design -> Implementation -> Testing -> Deployment.

## Phase 1: Environment & Infrastructure Setup
**Goal**: Get the project ready for development with all necessary dependencies and credentials.
**Estimated Time**: 1.5 - 2 Hours

- [ ] **1.1. Project Initialization**
  - Create a virtual environment (`python -m venv venv`).
  - Initialize `requirements.txt` with core libraries:
    - `langgraph`, `langchain`, `langchain-google-genai`
    - `python-jobspy`, `playwright`
    - `gspread` (for Sheets), `google-auth`
    - `python-dotenv`, `pytest`
- [ ] **1.2. Google Cloud Setup**
  - Create a Google Cloud Project.
  - Enable APIs: Google Sheets API, Google Drive API, Google Docs API.
  - Create a Service Account and download the JSON key.
  - Share your target Google Sheet/Drive folder with the Service Account email.
- [ ] **1.3. Environment Configuration**
  - Create `.env` file.
  - Add keys: `GOOGLE_API_KEY` (Gemini), `GOOGLE_APPLICATION_CREDENTIALS` (path to json), `SHEET_ID`, `DRIVE_FOLDER_ID`.
- [ ] **1.4. Basic Sheet Structure**
  - Create the Google Sheet with the required tabs: `job_inbox`, `optimized_jobs`, `job_tracker`, `rejected`.
  - Set up the "Lock" cell (A1) and Headers.

## Phase 2: Core Module Implementation (The Nodes)
**Goal**: Build the individual components that will make up the graph.
**Estimated Time**: 6 - 8 Hours

- [ ] **2.1. Sheet Manager Module (`nodes/sheets.py`)** (2 Hours)
  - Implement `SheetManager` class.
  - **Methods to build**:
    - `lock_sheet()` / `unlock_sheet()`: Critical for safety.
    - `read_all_jobs()`: Fetch current state from all tabs.
    - `write_job_to_inbox()`: Append new jobs.
    - `move_row()`: Logic to cut/paste rows between tabs.
  - **Test**: Write a small script to lock the sheet, write a row, and unlock it.

- [ ] **2.2. Scraper Module (`nodes/scraper.py`)** (2 Hours)
  - Integrate `python-jobspy`.
  - Implement `scrape_jobs(search_term, location, results_wanted)`.
  - Add `clean_data()` to normalize dates/salaries into your `JobDescription` TypedDict.
  - **Test**: Run a scrape and print the raw JSON output.

- [ ] **2.3. Classifier Node (`nodes/classifier.py`)** (1.5 Hours)
  - Create the LangChain prompt for Gemini.
  - Input: Raw Job Description.
  - Output: `JobStatus` (Approved/Rejected), `Score` (0-100), `Reasoning`.
  - **Test**: Feed it 3 sample job descriptions (1 good, 1 bad, 1 weird) and check the grading.

- [ ] **2.4. Optimization Node (`nodes/optimization.py`)** (2.5 Hours)
  - *Note: You'll need to create this file.*
  - Build the logic to take an `Approved` job.
  - Use an LLM to generate a Resume/Cover Letter based on the job description.
  - **Integration**: Use Google Docs API (via `langchain-google-community` or direct API) to create the file in Drive.
  - Return the `drive_link` to the state.

## Phase 3: Graph Orchestration & Logic
**Goal**: Connect the nodes using LangGraph to create the workflow.
**Estimated Time**: 3 Hours

- [ ] **3.1. State Definition (`state.py`)**
  - Finalize `JobAppState` TypedDict.
  - Ensure all fields match what the nodes expect/return.
- [ ] **3.2. Graph Construction (`graph.py`)**
  - Define the `StateGraph`.
  - Add nodes: `init_lock`, `scraper_branch`, `sheet_branch`, `optimizer`, `finalize`.
  - **Parallelism**: Set up the parallel execution for Scraping vs. Sheet Management.
- [ ] **3.3. Entry Point (`main.py`)**
  - Update `main.py` to run the graph.
  - Add global error handling (Try/Except) to ensure `unlock_sheet()` is ALWAYS called, even if the script crashes.

## Phase 4: Testing & Quality Assurance
**Goal**: Ensure reliability before automating.
**Estimated Time**: 2 - 3 Hours

- [ ] **4.1. Unit Testing**
  - Create `tests/test_nodes.py`.
  - Test each node in isolation using mock data.
- [ ] **4.2. Integration Testing**
  - Run the full graph with a "Dry Run" flag (don't actually apply to jobs, just log it).
  - Verify that rows move correctly from Inbox -> Optimized -> Tracker.
- [ ] **4.3. Edge Case Handling**
  - What if the scraper finds 0 jobs?
  - What if the API times out?
  - What if the sheet is already locked (stale lock)?

## Phase 5: Deployment
**Goal**: Set it and forget it.
**Estimated Time**: 1 Hour

- [ ] **5.1. Logging**
  - Ensure `run_history.json` or a text log is writing correctly.
- [ ] **5.2. Automation**
  - Create a cron job (macOS/Linux) or Task Scheduler (Windows) to run `main.py` every 12 hours.
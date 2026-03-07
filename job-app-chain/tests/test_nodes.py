import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from state import JobAppState, JobDescription, JobInboxItem, JobInboxStatus, OptimizedJob, OptimizedStatus
from nodes.scraper import scraper_node
from nodes.classifier import classifier_node
from nodes.sheets import sheets_reader_node, sheets_writer_node
from nodes.optimizer_agent import optimizer_node

# --- Test Scraper Node ---
@patch("nodes.scraper.scrape_jobs")
@patch("nodes.scraper.Scraper.load_and_clean_data")
def test_scraper_node(mock_load, mock_scrape):
    # Setup
    mock_scrape.return_value = 1
    mock_job = JobDescription(
        site="indeed", title="Dev", company="TestCo", city="Remote", state="", 
        job_type="Full-time", interval="Yearly", min_amount="100k", max_amount="120k", 
        job_url="http://test.com/1", description="Code stuff"
    )
    mock_load.return_value = [mock_job]
    
    state = JobAppState(
        search_term="python", location="remote", results_wanted=1, hours_old=24,
        existing_urls=[], scraped_jobs=[], new_jobs=[], approved_jobs=[], 
        optimized_jobs=[], rejected_jobs=[], tracked_jobs=[]
    )

    # Execution
    result = scraper_node(state)

    # Assertion
    assert "scraped_jobs" in result
    assert len(result["scraped_jobs"]) == 1
    assert result["scraped_jobs"][0]["title"] == "Dev"

# --- Test Classifier Node ---
@patch("nodes.classifier.classification_chain.invoke")
def test_classifier_node(mock_invoke):
    # Setup
    mock_invoke.return_value = {"classification": "approved", "reasoning": "Good fit"}
    mock_job = JobDescription(
        site="indeed", title="Dev", company="TestCo", city="Remote", state="", 
        job_type="Full-time", interval="Yearly", min_amount="100k", max_amount="120k", 
        job_url="http://test.com/1", description="Code stuff"
    )
    state = JobAppState(
        scraped_jobs=[mock_job], new_jobs=[], approved_jobs=[], 
        optimized_jobs=[], rejected_jobs=[], tracked_jobs=[], existing_urls=[],
        search_term="", location="", results_wanted=0, hours_old=0
    )

    # Execution
    result = classifier_node(state)

    # Assertion
    assert "new_jobs" in result
    assert len(result["new_jobs"]) == 1
    item = result["new_jobs"][0]
    assert item["classification"] == "approved"
    assert item["reasoning"] == "Good fit"
    assert item["inbox_status"] == JobInboxStatus.NEW

# --- Test Sheets Nodes ---
@patch("nodes.sheets.get_sheet_manager")
def test_sheets_reader_node(mock_get_manager):
    # Setup
    mock_manager = MagicMock()
    mock_manager.read_existing_urls.return_value = ["http://test.com/old"]
    mock_get_manager.return_value = mock_manager
    
    state = JobAppState(existing_urls=[], scraped_jobs=[], new_jobs=[], approved_jobs=[], optimized_jobs=[], rejected_jobs=[], tracked_jobs=[], search_term="", location="", results_wanted=0, hours_old=0)

    # Execution
    result = sheets_reader_node(state)

    # Assertion
    mock_manager.lock_sheet.assert_called_once()
    assert result["existing_urls"] == ["http://test.com/old"]

@patch("nodes.sheets.get_sheet_manager")
def test_sheets_writer_node(mock_get_manager):
    # Setup
    mock_manager = MagicMock()
    mock_get_manager.return_value = mock_manager
    
    mock_item = JobInboxItem(
        site="indeed", title="Dev", company="TestCo", city="Remote", state="", 
        job_type="Full-time", interval="Yearly", min_amount="100k", max_amount="120k", 
        job_url="http://test.com/new", description="Code stuff",
        classification="approved", reasoning="Good", inbox_status=JobInboxStatus.NEW, found_date="2023-01-01"
    )
    
    state = JobAppState(
        new_jobs=[mock_item], optimized_jobs=[], rejected_jobs=[], tracked_jobs=[],
        existing_urls=[], scraped_jobs=[], approved_jobs=[],
        search_term="", location="", results_wanted=0, hours_old=0
    )

    # Execution
    sheets_writer_node(state)

    # Assertion
    mock_manager.write_new_jobs.assert_called_once()
    mock_manager.unlock_sheet.assert_called_once()

# --- Test Optimizer Node ---
@patch("nodes.optimizer_agent._build_optimizer_agent")
def test_optimizer_node(mock_build_agent):
    # Setup: mock the deep agent to return a fake Drive URL response
    fake_response_content = (
        '{"resume_url": "https://drive.google.com/file/d/abc/view", '
        '"cover_letter_url": "https://drive.google.com/file/d/def/view", '
        '"research_brief": "TestCo builds great software."}'
    )
    mock_ai_message = MagicMock()
    mock_ai_message.type = "ai"
    mock_ai_message.content = fake_response_content

    mock_agent = MagicMock()
    mock_agent.invoke.return_value = {"messages": [mock_ai_message]}
    mock_build_agent.return_value = mock_agent

    mock_item = JobInboxItem(
        site="indeed", title="Dev", company="TestCo", city="Remote", state="",
        job_type="Full-time", interval="Yearly", min_amount="100k", max_amount="120k",
        job_url="http://test.com/new", description="Code stuff",
        classification="approved", reasoning="Good", inbox_status=JobInboxStatus.APPROVED, found_date="2023-01-01"
    )

    state = JobAppState(
        approved_jobs=[mock_item], new_jobs=[], optimized_jobs=[], rejected_jobs=[], tracked_jobs=[],
        existing_urls=[], scraped_jobs=[], search_term="", location="", results_wanted=0, hours_old=0
    )

    # Execution
    result = optimizer_node(state)

    # Assertion
    assert "optimized_jobs" in result
    assert len(result["optimized_jobs"]) == 1
    job = result["optimized_jobs"][0]
    assert "drive.google.com" in job["resume_url"]
    assert "drive.google.com" in job["cover_letter_url"]
    assert job["research_brief"] == "TestCo builds great software."
    assert job["optimized_status"] == OptimizedStatus.NEW


def test_optimizer_node_empty_approved():
    """Skip optimization when no approved jobs."""
    state = JobAppState(
        approved_jobs=[], new_jobs=[], optimized_jobs=[], rejected_jobs=[], tracked_jobs=[],
        existing_urls=[], scraped_jobs=[], search_term="", location="", results_wanted=0, hours_old=0
    )
    result = optimizer_node(state)
    assert result == {"optimized_jobs": []}

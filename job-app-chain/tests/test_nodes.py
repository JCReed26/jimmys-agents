"""DANGER: THIS IS COMPLETELY VIBE CODED AND NOT CHECKED"""
import pytest
from nodes.optimizer_agent import optimizer_node
from state import JobAppState, JobInboxItem

def test_optimizer_node_stub():
    # 1. Setup mock state
    mock_job = {
        "title": "Test Engineer",
        "company": "Test Co",
        "job_url": "http://test.com",
        "classification": "approved"
    }
    
    state: JobAppState = {
        "approved_jobs": [mock_job],
        "new_jobs": [],
        "optimized_jobs": [],
        "rejected_jobs": [],
        "tracked_jobs": []
    }

    # 2. Run node
    result = optimizer_node(state)

    # 3. Assertions
    assert "optimized_jobs" in result
    assert len(result["optimized_jobs"]) == 1
    
    optimized_job = result["optimized_jobs"][0]
    assert optimized_job["title"] == "Test Engineer"
    assert "resume_url" in optimized_job
    assert "Stub" in optimized_job["reasoning"]
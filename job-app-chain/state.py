from typing import TypedDict, List, Optional
from enum import Enum

class JobStatus(Enum):
    NEW = "new"
    APPROVED = "approved"
    REJECTED = "rejected"

class ApplicationStatus(Enum):
    READY_FOR_REVIEW = "ready_for_review"
    DECIDED_AGAINST = "decided_against"
    APPLIED = "applied"
    IN_PROGRESS = "in_progress"
    GHOSTED = "ghosted"
    REJECTED = "rejected"
    ACCEPTED = "accepted"

class JobDescription(TypedDict):
    id: str                 # hash of url 
    title: str
    company: str
    url: str
    raw_description: str
    score: Optional[int]                # score 0-100
    reasoning: Optional[str]            # reasoning for score
    status: JobStatus
    found_date: str

class JobApplication(JobDescription):
    resume_url: str             # Google Drive Link 
    cover_letter_url: str       # Google Drive Link
    application_status: ApplicationStatus

    # Optional Fields
    salary_range: Optional[str]
    location: Optional[str]
    date_posted: Optional[str]
    
    

class LogEntry(TypedDict):
    timestamp: str
    level: str
    message: str
    node: str

class JobAppState(TypedDict):
    # Data Containers
    scraped_jobs: List[JobDescription]
    job_inbox: List[JobDescription]
    optimized_jobs: List[JobApplication]
    rejected_jobs: List[JobDescription]
    """
    why no applied jobs? will become too large a list and not necessary for the main purpose of the workflow, if we want to do operations on applied jobs we get them from the tracker tab.
    """

    # Metadata
    logs: List[LogEntry]
    last_execution_time: str
    is_locked: bool # is the sheet red(block edits) or green(allow edits) its a mutex lock
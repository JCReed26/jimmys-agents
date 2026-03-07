from operator import add
from typing import TypedDict, List, Annotated, Optional
from enum import Enum

# JobSpy Returned table --> must match job description for classification after that it becomes an application before hitting job_inbox
# SITE | TITLE | COMPANY | CITY | STATE | JOB_TYPE | INTERVAL | MIN_AMOUNT | MAX_AMOUNT | JOB_URL | DESCRIPTION
class JobDescription(TypedDict):
    site: str
    title: str
    company: str
    city: str
    state: str
    job_type: str
    interval: str
    min_amount: str
    max_amount: str
    job_url: str
    description: str

class RejectedJob(JobDescription):
    rejected_reason: str
    rejected_date: str

class JobInboxStatus(Enum):
    NEW = "new" # default state set by ai
    APPROVED = "approved" # approved by jimmy to go to optimization process
    REJECTED = "rejected" # rejected by jimmy to go to rejected tab

class JobInboxItem(JobDescription):
    classification: str
    reasoning: str
    inbox_status: JobInboxStatus = JobInboxStatus.NEW
    found_date: str

class OptimizedStatus(Enum):
    NEW = "new" # default state set by ai
    APPROVED = "approved" # approved by jimmy to go to tracker aka applied for the job
    REJECTED = "rejected" # rejected by jimmy to go to rejected tab aka decided against applying for the job

class OptimizedJob(JobInboxItem):
    resume_url: str
    cover_letter_url: str
    reasoning: str
    research_brief: str
    optimized_status: OptimizedStatus = OptimizedStatus.NEW
    optimized_date: str

class TrackedStatus(Enum):
    APPLIED = "applied"                     # applied for the job default state
    REJECTED = "rejected"                   # rejected by company after applying for the job
    GHOSTED = "ghosted"                     # no contact from company after applying
    INTERVIEWING = "interviewing"           # interviewing for the job
    FAILED_INTERVIEW = "failed_interview"   # failed interview for the job
    OFFER_RECEIVED = "offer_received"       # offer received from the company
    OFFER_ACCEPTED = "offer_accepted"       # offer accepted by the company
    OFFER_REJECTED = "offer_rejected"       # offer rejected by the company
    OFFER_EXPIRED = "offer_expired"         # offer expired by the company

class TrackedJob(OptimizedJob):
    tracked_status: TrackedStatus = TrackedStatus.APPLIED
    applied_date: str

class JobAppState(TypedDict):
    # Input parameters
    search_term: str
    location: str
    results_wanted: int
    hours_old: int
    
    # State lists
    scraped_jobs: Annotated[List[JobDescription], add]
    new_jobs: Annotated[List[JobInboxItem], add]
    approved_jobs: Annotated[List[JobInboxItem], add]
    optimized_jobs: Annotated[List[OptimizedJob], add]
    rejected_jobs: Annotated[List[RejectedJob | JobInboxItem | OptimizedJob], add]
    tracked_jobs: Annotated[List[TrackedJob], add]
    
    # Internal state for deduplication
    existing_urls: List[str]

    # Error propagation — set by nodes on failure so writer can still unlock
    error_message: Optional[str]

"""
All of these will correspond to an id in a local sqlite database for each job so that no matter where the job is in the workflow or sheet all data can be queried if needed.
How the tables will look like on the google sheet:

Inbox Job Table ('job_inbox' tab)
SITE | TITLE | COMPANY | CITY | STATE | JOB_TYPE | INTERVAL | MIN_AMOUNT | MAX_AMOUNT | JOB_URL | DESCRIPTION | CLASSIFICATION | REASONING | INBOX_STATUS | FOUND_DATE | ID

Optimized Job Table ('optimized_jobs' tab)
TITLE | COMPANY | CITY | MIN_AMOUNT | MAX_AMOUNT | JOB_URL | RESUME_URL | COVER_LETTER_URL | OPTIMIZED_STATUS | OPTIMIZED_DATE | ID

Rejected Job Table ('rejected_jobs' tab)
SITE | TITLE | COMPANY | CITY | STATE | JOB_TYPE | INTERVAL | MIN_AMOUNT | MAX_AMOUNT | JOB_URL | DESCRIPTION | REJECTED_REASON | REJECTED_DATE | ID

Tracked Job Table ('tracked_jobs' tab)
TITLE | COMPANY | CITY | STATE | JOB_URL | TRACKED_STATUS | APPLIED_DATE | ID

"""
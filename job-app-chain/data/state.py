"""
This is the langgraph state object for the job application chain
"""

from typing import List, TypedDict
from pydantic import BaseModel

class Job(BaseModel):
    job_id: str # unique id for every job that comes in the chain 
    title: str
    company: str
    location: str
    job_description: str
    job_url: str
    
class JobChainState(TypedDict):
    jobs_to_clean: List[Job]
    jobs_to_sort: List[Job]
    jobs_to_optimize: List[Job]
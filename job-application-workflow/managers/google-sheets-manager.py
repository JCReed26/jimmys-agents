# Google Sheets Manager 
# handles the google sheets api and data in the sheets 
# will be triggered for certain actions 
# 
# - take new Job Application add to inbox list for review
# - take job applied to and add to job tracker 

from datetime import datetime
from typing import Optional, List, Tuple
from pydantic import BaseModel, Field
from langchain_google_community import SheetsToolkit
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_agent

system_prompt = """You are a helpful assistant that manages the google sheets for the job application workflow.
There are 2 sheets in the google sheet:
- Inbox List: Tracks Jobs that have been found, had documents optimized, and are ready for review
- Job Tracker: Tracks Jobs that have been applied to and are waiting for a response

You will be given a job object and you will need to add it to the inbox list for review.
You will also be given a job object with the applied boolean set to true and you will need to add to job tracker and delete from inbox list.

Your tools are: 
- Google Sheet Toolkit: This will allow you to read and manipulate the google sheet
- add_job_to_inbox: Adds a job to the inbox list for review
- move_job_to_applied: Adds a job to the job tracker and deletes from inbox list
"""

class Job(BaseModel):
    JobId: str
    CellReference: Tuple[str, str]
    JobTitle: str
    JobLocation: Optional[str] = None
    JobSource: Optional[str] = None
    JobUrl: str
    PayRange: Optional[Tuple[int, int]] = None
    OptimizedResumeLink: Optional[str] = None
    OptimizedCoverLetterLink: Optional[str] = None
    Applied: bool = False
    AppliedDate: Optional[str] = None
    Status: Optional[str] = None
    

class JobSheetManager:
    def __init__(self):
        self.toolkit = SheetsToolkit()

    def add_job_to_inbox(self, job: Job):
        # Takes Found Job and Adds to Inbox List For Review 
        pass

    def move_job_to_applied(self, job: Job):
        # Take jobs where applied is true and move to applied list
        pass

sheet_manager = JobSheetManager()

tools = sheet_manager.toolkit.get_tools()
tools.append(sheet_manager.add_job_to_inbox)
tools.append(sheet_manager.move_job_to_applied)

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.0)
llm_with_tools = llm.bind_tools(tools)

agent_executor = create_agent(
    model=llm, 
    tools=tools, 
    system_prompt=system_prompt
    )

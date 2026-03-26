from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from pathlib import Path
from langchain_google_genai import ChatGoogleGenerativeAI
import os
from langchain_core.messages import HumanMessage
from datetime import datetime
from typing import TypedDict, Optional

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)

class JobInProcess(TypedDict):
    id: str
    title: str
    company: str
    job_url: str
    description: str
    classification: str
    resume_template_id: str
    cover_letter_template_id: str
    optimized_date: Optional[datetime]
    optimized_resume_id: Optional[str]
    optimized_cover_letter_id: Optional[str]
    applied_date: Optional[datetime]
    applied_status: Optional[str]

def get_first_approval():
    """HITL Approval for the job that passed classification before spending optimization tokens"""
    pass

def get_second_approval():
    """HITL Approval for the job that was optimized to confirm if it was applied to"""
    pass

def save_job_to_tracker():
    """Saves the job to the job tracker database"""
    pass

def move_job_to_rejected():
    """Moves the job to the rejected jobs database"""
    pass

SYSTEM_PROMPT = """
You are a job search agent that helps the user find jobs and apply to them.
You follow a process to find jobs that are a good fit for the user.
You will use the tools provided to you and chains of thought to find jobs.

You have 4 csv files that you manage with your filesystem backend
- found_jobs.csv - jobs that have been found and are waiting to be classified
- classified_jobs.csv - jobs that have been classified and are waiting to be approved
- optimized_jobs.csv - jobs that have been optimized and are waiting to be applied to
- applied_jobs.csv - jobs that have been applied to and are waiting to be tracked
- rejected_jobs.csv - jobs that have been rejected and are waiting to be moved to the rejected jobs database

The process:
1. Check found jobs, if none found use get_new_jobs skill to get new jobs in the found jobs database
2. You will then use the classification subagent with classifier skill to classify the job
3. If the classification is good, call the get_first_approval HITL 
4. If approved, call the optimization subagent to take the resume and cover letter templates and optimize them for the job
5. After optimization, verify the files were truly optimized to the job description and then call get_second_approval HITL
6. If approved, the job was applied to and should be added to the job tracker database. call save_job_to_tracker tool
"""

tools = [
    get_first_approval,
    get_second_approval,
    save_job_to_tracker,
    move_job_to_rejected,
]

classification_agent = create_deep_agent(
    name="Classification Agent",
    model=llm,
    tools=tools,
    system_prompt=CLASSIFICATION_SYSTEM_PROMPT,
)

optimization_agent = create_deep_agent(
    name="Optimization Agent",
    model=llm,
    tools=tools,
    system_prompt=OPTIMIZATION_SYSTEM_PROMPT,
)

job_tracker_agent = create_deep_agent(
    name="Job Tracker Agent",
    model=llm,
    tools=tools,
    system_prompt=JOB_TRACKER_SYSTEM_PROMPT,
)

agent = create_deep_agent(
    name="Job Search Agent",
    model=llm,
    tools=tools,
    system_prompt=SYSTEM_PROMPT,
    skills=["skills/"],
    memory=["skills/AGENTS.md"],
    backend=FilesystemBackend(root_dir=Path(__file__).parent.absolute()),
    subagents=[classification_agent, optimization_agent, job_tracker_agent]
)


async def run_agent_cycle(input_message: str, thread_id: str = None):
    """Run agent from API/Chat/Scheduler. Returns all agent steps."""
    config = {"configurable": {"thread_id": thread_id or f"thread-{os.urandom(8).hex()}"}}

    async for chunk in agent.astream(
        {"messages": [HumanMessage(content=input_message)]},
        config=config,
        stream_mode="updates",
        version="v2",
    ):
        if chunk["type"] == "updates":
            for step, data in chunk["data"].items():
                print(f"Step: {step}")
                if data.get("messages"):
                    print(f"Data: {data['messages'][-1].content}")

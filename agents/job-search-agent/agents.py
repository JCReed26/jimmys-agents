from deepagents import create_deep_agent
from langchain.tools import tool
from deepagents.backends import FilesystemBackend
from pathlib import Path
import os
from backend.models import gemini_flash_model
from langchain_core.messages import HumanMessage
from datetime import datetime
from typing import TypedDict, Optional
from sub_agents import job_tracker_agent, classification_agent, optimization_agent

llm = gemini_flash_model

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

@tool
def get_first_approval():
    """HITL Approval for the job that passed classification before spending optimization tokens"""
    pass

@tool
def get_second_approval():
    """HITL Approval for the job that was optimized to confirm if it was applied to"""
    pass

SYSTEM_PROMPT = """
You are a job search agent that helps the user find jobs and apply to them.
You follow a process to find jobs that are a good fit for the user.
You will use the tools provided to you and chains of thought to find jobs.

You have 5 csv files that you manage with your filesystem backend
- found_jobs.csv - jobs that have been found and are waiting to be classified
- classified_jobs.csv - jobs that have been classified and are waiting to be approved through first approval
- optimized_jobs.csv - jobs that have been optimized and are waiting to be applied to through second approval
- applied_jobs.csv - jobs that have been applied to and are waiting to be tracked
- rejected_jobs.csv - jobs that have been rejected and are waiting to be moved to the rejected jobs database

The process:
1. Check found jobs, if none found use get_new_jobs skill to get new jobs in the found jobs database
2. You will then use the classification subagent with classifier skill to classify the job
3. If the classification is good, call the get_first_approval HITL 
4. If approved, call the optimization subagent to take the resume and cover letter templates and optimize them for the job
5. After optimization, verify the files were truly optimized to the job description and then call get_second_approval HITL
6. If approved, the job was applied to and should be added to the job tracker database. call save_job_to_tracker tool

You will have another markdown file that you will manage (must chat with user first to initialize this file)
The file is called candidate_profile.md this is where you will store the users goal for what they do in their position
job titles can be all over the place and thus giving you what the actual tasks the candidate can cover you can discover better jobs

you have skills to help with different tasks and skills to assign to sub agents when spawning them.
"""

tools = [
    get_first_approval,
    get_second_approval,
]
skills = ["skills/"]
memory = ["skills/AGENTS.md"]
backend = FilesystemBackend(root_dir=Path(__file__).parent.absolute())
subagents = [job_tracker_agent, classification_agent, optimization_agent]

agent = create_deep_agent(
    name="Job Search Agent",
    model=llm,
    tools=tools,
    interrupt_on={
        "get_first_approval": {"allowed_values": ["approve", "reject"]},
        "get_second_approval": True,            # approve, edit, reject
    },
    system_prompt=SYSTEM_PROMPT,
    skills=skills,
    memory=memory,
    backend=FilesystemBackend(root_dir=Path(__file__).parent.absolute()),
    subagents=subagents,
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

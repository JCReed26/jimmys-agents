"""
Optimizer Agent Vision

This agent will need to follow a distinct process to optimize the jobs for the user.
This is why I have chosen to use a Deep Agent to handle this process.
Why: 

- write_todos: this allows the agent to create a todo list to ensure all steps are completed and tracked.
- ls, read_file, write_file, edit_file: this allows the agent to take a copy and edit locally before uploading online as a new file in google drive.
- subagent spawning: this allows the agent to spawn a subagent to handle research of a company and have a separate agent handle finding connections to the job and or company to use in the cover letter and or use as context for resume optimization.
- long-term-storage: this allows the agent to draw off of past files of jobs that got interviews and use them to improve over time.
- improvement loop: the agent can improve over time 
- skills: for specific tasks that need to be completed, in any order chosen dynamically, some run multiple times, other once, others none at all.

Edge Cases: 
- validate the application actually accepts a cover letter before creating one. 
- if the application is a common site, we can assume, otherwise, playwright should be able to handle checking 
- ?????

"""

# stub agent 

from langchain.agents import create_agent
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

prompt = """
You are an optimizer agent that will optimize the jobs for the user.
"""

optimizer_agent = create_agent(
    model=llm,
    system_prompt=prompt,
)

from langchain_core.messages import SystemMessage
from state import JobAppState, OptimizedJob, OptimizedItem
from datetime import datetime

def optimizer_node(state: JobAppState) -> JobAppState:
    """
    Stub for the Optimizer Agent.
    
    Future: This will use a local LLM to generate resumes/cover letters.
    Current: Passes through 'approved' jobs and marks them as 'new' optimized jobs.
    """
    print("--- Optimizer Node (Stub) ---")
    
    approved_jobs = state.get("approved_jobs", [])
    optimized_jobs = []

    # In the future, this loop will call the local LLM
    for job in approved_jobs:
        # Mocking the optimization process
        optimized_job = OptimizedJob(
            **job, # Copy existing fields
            resume_url="http://mock-drive-link/resume",
            cover_letter_url="http://mock-drive-link/cover-letter",
            reasoning="Stub: Auto-approved for testing.",
            optimized_status=OptimizedItem.NEW,
            optimized_date=datetime.now().isoformat()
        )
        optimized_jobs.append(optimized_job)
        print(f"Stubbed optimization for: {job.get('title', 'Unknown Job')}")

    # We return the updates to the state
    return {
        "optimized_jobs": optimized_jobs, 
        # In a real run, we might want to clear 'approved_jobs' or mark them as processed
        # depending on how the reducer works.
    }
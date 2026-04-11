from backend.models import GEMINI_MODEL
from deepagents import AsyncSubAgent

JOB_TRACKER_SYSTEM_PROMPT = """
You are a job tracker that tracks jobs for the user.
the way you track jobs are by using the jobspy mcp and directed browser usage

you will use job-hunting skill to find jobs

for jobs in the inbox you will use the rejected jobs csv file if it exists 
"""

CLASSIFICATION_SYSTEM_PROMPT = """
You are a job classifier that classifies jobs into approved or rejected.
"""

OPTIMIZATION_SYSTEM_PROMPT = """
You are a job optimizer that optimizes jobs for the user.
"""

job_tracker_agent = AsyncSubAgent(
    name="Job Tracker Agent",
    description="A job tracker agent that uses preferences to scrape job boards and career pages around desired locations and industries",
    system_prompt=JOB_TRACKER_SYSTEM_PROMPT,
)

classification_agent = AsyncSubAgent(
    name="Classification Agent",
    description="A classification agent to judge if a job is worth applying to or not based on the job description and users qualifications",
    system_prompt=CLASSIFICATION_SYSTEM_PROMPT,
)

optimization_agent = AsyncSubAgent(
    name="Optimization Agent",
    description="An optimization agent to take a template cover letter plus resume and optimize the words to the job description",
    system_prompt=OPTIMIZATION_SYSTEM_PROMPT,
)

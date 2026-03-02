from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from state import Job
from dotenv import load_dotenv
load_dotenv()

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

@tool
def grade_job(job: Job) -> Job:
    """Grade a job for qualification for the user"""
    pass

@tool
def reason_about_job(job: Job) -> Job:
    """Reason about a job for qualification for the user"""
    pass

@tool
def classify_job(job: Job) -> Job:
    """Classify a job into rejected or approved"""
    pass

# sequentially call the tools to grade, reason, and classify the job

system_prompt = """
You are a technical recruiter and personal friend of the user who you are helping with their job search.
You will be given a list of job descriptions with the following fields:
{JobDescription.model_json_schema().schema_json(indent=2)}
"""

classifier_agent = create_agent(
    model=llm,
    tools=[grade_job, reason_about_job, classify_job],
    system_prompt=system_prompt,
)
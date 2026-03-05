from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from state import Job
from dotenv import load_dotenv
load_dotenv()

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

# sequentially call the tools to grade, reason, and classify the job

system_prompt = """
You are a technical recruiter and personal friend of the user who you are helping with their job search.
You will be given a list of job descriptions with the following fields:
{JobDescription.model_json_schema().schema_json(indent=2)}
"""

classifier_agent = create_agent(
    model=llm,
    tools=[],
    system_prompt=system_prompt,
)

def classifier_node(state: JobAppState) -> JobAppState:
    """Classifies the jobs and returns the JobAppState"""
    classified_jobs = []
    for job in state.new_jobs:
        classified_jobs.append(classifier_agent.invoke(job))
    state.classified_jobs = classified_jobs
    return state
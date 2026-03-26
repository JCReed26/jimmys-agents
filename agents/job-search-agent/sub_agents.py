from deepagents import create_deep_agent
from langchain_google_genai import ChatGoogleGenerativeAI

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)

JOB_TRACKER_SYSTEM_PROMPT = """
You are a job tracker that tracks jobs for the user.
"""

CLASSIFICATION_SYSTEM_PROMPT = """
You are a job classifier that classifies jobs into approved or rejected.
"""

OPTIMIZATION_SYSTEM_PROMPT = """
You are a job optimizer that optimizes jobs for the user.
"""

job_tracker_agent = create_deep_agent(
    name="Job Tracker Agent",
    model=llm,
    system_prompt=JOB_TRACKER_SYSTEM_PROMPT,
)

classification_agent = create_deep_agent(
    name="Classification Agent",
    model=llm,
    system_prompt=CLASSIFICATION_SYSTEM_PROMPT,
)

optimization_agent = create_deep_agent(
    name="Optimization Agent",
    model=llm,
    system_prompt=OPTIMIZATION_SYSTEM_PROMPT,
)

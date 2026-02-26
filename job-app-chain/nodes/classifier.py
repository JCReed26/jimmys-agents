from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import JobAppState, JobDescription
from dotenv import load_dotenv

load_dotenv()

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

system_prompt = f"""
You are a technical recruiter and personal friend of the user who you are helping with their job search.
You will be given a list of job descriptions with the following fields:
{JobDescription.model_json_schema().schema_json(indent=2)}
"""

print(JobDescription.model_json_schema().schema_json(indent=2))
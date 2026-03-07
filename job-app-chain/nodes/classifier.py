from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from datetime import datetime
from state import JobAppState, JobInboxItem, JobInboxStatus
import json

# Initialize LLM
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)

# Define the classification prompt
classification_prompt = ChatPromptTemplate.from_template(
    """
    You are a technical recruiter and personal friend of the user who you are helping with their job search.
    Please classify the following job as 'approved' (should apply) or 'rejected' (should not apply).
    
    User Preferences:
    - Role: Software Engineer, Full Stack Developer, AI Engineer
    - Location: Remote or Hybrid (if close to user's location)
    - Salary: Competitive
    - Tech Stack: Python, TypeScript, React, Node.js, AI/ML
    
    Job Description:
    {job_description}
    
    Return the classification in the following JSON format:
    {{
        "classification": "approved" | "rejected",
        "reasoning": "brief explanation for the classification"
    }}
    """
)

# Create the chain
classification_chain = classification_prompt | llm | JsonOutputParser()

def classifier_node(state: JobAppState) -> JobAppState:
    """Classifies the scraped jobs and returns the JobAppState with new_jobs."""
    print("--- Classifier Node ---")
    try:
        scraped_jobs = state.get("scraped_jobs", [])
        new_jobs = []

        print(f"Classifying {len(scraped_jobs)} jobs...")

        for job in scraped_jobs:
            try:
                job_str = json.dumps(job, indent=2)
                result = classification_chain.invoke({"job_description": job_str})

                classification = result.get("classification", "rejected").lower()
                reasoning = result.get("reasoning", "No reasoning provided.")

                inbox_item = JobInboxItem(
                    **job,
                    classification=classification,
                    reasoning=reasoning,
                    inbox_status=JobInboxStatus.NEW,
                    found_date=datetime.now().strftime("%Y-%m-%d")
                )
                new_jobs.append(inbox_item)
                print(f"Classified: {job.get('title', 'Unknown')} -> {classification}")
            except Exception as e:
                print(f"Error classifying job {job.get('title', 'Unknown')}: {e}")
                continue

        return {"new_jobs": new_jobs}
    except Exception as e:
        print(f"Classifier node failed: {e}")
        return {"new_jobs": [], "error_message": f"classifier_node: {e}"}

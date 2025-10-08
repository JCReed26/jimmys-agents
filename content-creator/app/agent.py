import os
import google.auth
from google.adk.agents import SequentialAgent

_, project_id = google.auth.default()
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project_id)
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")

def get_approval():
    # Placeholder for Telegram logic to send and wait for approval
    return True

def get_post_verification():
    # Placeholder for Telegram logic to send and wait for post-verification sends all data for human audit
    return True

content_creator = SequentialAgent(
    name="root_agent",
    model="gemini-2.5-flash",
    instruction="You are a helpful AI assistant",
    tool=[
        get_approval,
        get_post_verification
    ],
    sub_agents=[],
)

root_agent = content_creator 
import os
import google.auth
from google.adk.agents import SequentialAgent

# In-order
from .sub_agents.idea_generator.agent import idea_generator
from .sub_agents.prompts_generator.agent import prompts_generator
from .sub_agents.json_to_vid_agent.agent import json_to_vid_agent
from .sub_agents.final_post_creation.agent import final_post_creation

_, project_id = google.auth.default()
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project_id)
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")

content_creator = SequentialAgent(
    name="root_agent",
    model="gemini-2.5-flash",
    instruction="You are a helpful AI assistant",
    sub_agents=[
        idea_generator,
        prompts_generator,
        json_to_vid_agent,
        final_post_creation
    ],
)

root_agent = content_creator 
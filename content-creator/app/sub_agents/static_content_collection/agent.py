from google.adk.agents.llm_agent import Agent

static_content_collection = Agent(
    model='gemini-2.5-flash',
    name='static_content_collection',
    description='A helpful assistant for user questions.',
    instruction='Answer user questions to the best of your knowledge',
)

from google.adk.agents.llm_agent import Agent

# Tools 

# A way to pull past content from that account (get late)
def get_past_content():
    pass

# A way to search the web for relevant and trending topics (look for built in tools)
def search_web():
    pass

def get_idea_approval():
    # Placeholder for Telegram logic to send and wait for approval
    return True

idea_generator = Agent(
    model='gemini-2.5-flash',
    name='idea_generator',
    description='You generate ideas for content that is original, relevant, and engaging.',
    instruction="""You are an idea generator. Generate creative and original content ideas based on the account description provided by the user. Ensure the ideas are relevant to the account's theme and audience.""",
    tool=[],
)

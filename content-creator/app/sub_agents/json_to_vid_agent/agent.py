from google.adk.agents.llm_agent import Agent

class Json2VidInstance():
    def __init__():
        """Creates a new video instance for json 2 video api"""
        pass

    # rest of api implemented

json_to_vid_agent = Agent(
    model='gemini-2.5-flash',
    name='json_to_vid_agent',
    description='A helpful assistant for user questions.',
    instruction='Answer user questions to the best of your knowledge',
)

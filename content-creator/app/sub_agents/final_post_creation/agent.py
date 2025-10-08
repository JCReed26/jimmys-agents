from google.adk.agents.llm_agent import Agent

def upload_post_to_getlate():
    """uploads media content to get late. Returns result"""
    return True

def get_approval_to_post():
    """Placeholder for Telegram logic to send and wait for post-verification sends all data for human audit"""
    return True

def post_to_social_media():
    """Placeholder for logic to post to social media platforms"""
    return True

def configure_upload():
    """Returns the proper format for post to be uploaded."""
    pass

def configure_post():
    """Returns the proper format for post to be send to social media platforms."""

final_post_creation = Agent(
    model='gemini-2.5-flash',
    name='final_post_creation',
    description='You get all the files, comments, data in order. Get approval to post, and send the post to get late',
    instruction='Answer user questions to the best of your knowledge',
)

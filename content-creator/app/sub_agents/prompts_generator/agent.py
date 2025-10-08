from google.adk.agents.llm_agent import Agent

prompts_generator = Agent(
    model='gemini-2.5-flash',
    name='prompts_generator',
    description='A prompt generation agent that creates multiple prompts to be used for various content creation related tasks.',
    instruction='Overall Video Contents and Makeup, Short Video Clips Prompt, and Video Script Prompt if needed. Generate each prompt for its specific category based on the user input and account description provided by the user.',
    tool=[],
)

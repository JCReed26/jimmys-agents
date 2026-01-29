import os 
import time 
from datetime import datetime
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_google_community import CalendarToolkit
from dotenv import load_dotenv


load_dotenv()

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.0)
toolkit = CalendarToolkit()
tools = toolkit.get_tools()

system_prompt = """You are a Calendar Agent.

"""

agent = create_agent(model=llm, tools=tools, system_prompt=system_prompt)

def run_agent_cycle():
    """chat with the agent over cli"""
    pass

# run the agent file for testing the basic chat and functionality of the agent
if __name__ == "__main__":
    try:
        run_agent_cycle()
    except KeyboardInterrupt:
        print("\n--- Agent Stopped By User ---")
    except Exception as e:
        print(f"\n--- Cycle Failed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
        print(f"Error: {e}")
        time.sleep(60) # 1 minute
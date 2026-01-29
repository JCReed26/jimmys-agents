import time
from datetime import datetime
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
load_dotenv()

def authorization():
    pass

# TASK 
@tool
def get_by_task_and_project(project_id: str, task_id: str):
    pass

@tool
def create_task():
    pass

@tool
def update_task():
    pass

@tool
def complete_task():
    pass

@tool
def delete_task():
    pass

# PROJECT

@tool
def get_user_projects():
    pass

@tool
def get_project_by_id():
    pass

@tool
def get_project_with_data():
    pass

@tool
def create_project():
    pass

@tool
def update_project():
    pass

@tool
def delete_project():
    pass

tools = [
    get_by_task_and_project,
    create_task,
    update_task,
    complete_task,
    delete_task,
    get_user_projects,
    get_project_by_id,
    get_project_with_data,
    create_project,
    update_project,
    delete_project,
]

# TODO: Optimize this prompt for the agent to be a product manager that can manage projects and tasks 
system_prompt = """
product manager 

lists tasks
fills detailed task descriptions
make subtasks to follow 
optimizes days for time and effor by scheduling blocks with choices of what to do 
all things not done within the focus block is moved along to the next focus block 

your job is to manage projects by setting todo lists and breaking down tasks with clear descriptions on how to complete the task

each project represents a different list 
a list can be a project, a list of projects, an ongoing list of tasks, workout training plan checkpoints, etc. 
"""

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.0)

agent_executor = create_agent(
    model=llm, 
    tools=tools, 
    system_prompt=system_prompt
    )

def run_agent_cycle():
    pass

if __name__ == "__main__":
    while True:
        try:
            run_agent_cycle()
        except KeyboardInterrupt:
            print("\n--- Agent Stopped By User ---")
            break
        except Exception as e:
            print(f"\n--- Cycle Failed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
            print(f"Error: {e}")
            time.sleep(60) # 1 minute
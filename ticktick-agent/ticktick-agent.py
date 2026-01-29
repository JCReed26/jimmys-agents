import time
import os
from datetime import datetime
from typing import Optional, List

# LangChain imports
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

# Import our custom client
from ticktick_client import TickTickClient

load_dotenv()

# Global client variable
client: Optional[TickTickClient] = None

def authorization():
    """
    Handles TickTick authentication using our custom TickTickClient.
    """
    global client
    client = TickTickClient()
    client.authorize()

# Helper to ensure we are logged in before any tool runs
def get_client() -> TickTickClient:
    if not client:
        authorization()
    return client

# --- TASK TOOLS ---

@tool
def get_by_task_and_project(project_id: str, task_id: str):
    """Get details of a specific task by its ID and Project ID."""
    try:
        return get_client().get_task(project_id, task_id)
    except Exception as e:
        return f"Error fetching task: {str(e)}"

@tool
def create_task(title: str, content: str = "", project_id: str = None, start_date: str = None, due_date: str = None):
    """
    Create a new task.
    - title: Task title
    - content: Description or notes
    - project_id: Optional ID of the project/list to add to (defaults to Inbox)
    - start_date: Optional start date (ISO format string)
    - due_date: Optional due date (ISO format string)
    """
    try:
        # Pass None for project_id if it's not provided, client handles default
        return get_client().create_task(title, project_id, content, start_date, due_date)
    except Exception as e:
        return f"Error creating task: {str(e)}"

@tool
def update_task(task_id: str, project_id: str, title: str = None, content: str = None):
    """Update an existing task. Requires task_id and project_id."""
    try:
        return get_client().update_task(task_id, project_id, title, content)
    except Exception as e:
        return f"Error updating task: {str(e)}"

@tool
def complete_task(task_id: str, project_id: str):
    """Mark a task as completed."""
    try:
        return get_client().complete_task(task_id, project_id)
    except Exception as e:
        return f"Error completing task: {str(e)}"

@tool
def delete_task(task_id: str, project_id: str):
    """Delete a task."""
    try:
        return get_client().delete_task(task_id, project_id)
    except Exception as e:
        return f"Error deleting task: {str(e)}"

# --- PROJECT (LIST) TOOLS ---

@tool
def get_user_projects():
    """Get all projects (lists) for the user. Returns name and ID."""
    try:
        projects = get_client().get_projects()
        # Return simplified list
        return [{"name": p.get('name'), "id": p.get('id'), "kind": p.get('kind')} for p in projects]
    except Exception as e:
        return f"Error fetching projects: {str(e)}"

@tool
def get_project_by_id(project_id: str):
    """Get details of a specific project/list."""
    try:
        return get_client().get_project(project_id)
    except Exception as e:
        return f"Error fetching project: {str(e)}"

@tool
def create_project(name: str):
    """Create a new project/list."""
    try:
        return get_client().create_project(name)
    except Exception as e:
        return f"Error creating project: {str(e)}"

@tool
def update_project(project_id: str, name: str):
    """Rename a project."""
    try:
        return get_client().update_project(project_id, name)
    except Exception as e:
        return f"Error updating project: {str(e)}"

@tool
def delete_project(project_id: str):
    """Delete a project."""
    try:
        return get_client().delete_project(project_id)
    except Exception as e:
        return f"Error deleting project: {str(e)}"

# Re-use existing tool list
tools = [
    get_by_task_and_project,
    create_task,
    update_task,
    complete_task,
    delete_task,
    get_user_projects,
    get_project_by_id,
    create_project,
    update_project,
    delete_project,
]

system_prompt_text = """
You are a Product Manager Agent responsible for managing the user's TickTick todo list.

Responsibilities:
1. Manage projects (which represent lists of tasks).
2. Create and organize tasks with clear titles and descriptions.
3. Break down large goals into subtasks (if applicable).
4. Prioritize work by setting dates and organizing blocks.

Each project represents a different list (e.g., Work, Personal, Gym).
Always check existing projects using `get_user_projects` before creating a new one to avoid duplicates.

STANDARD OPERATING PROCEDURE:
1. EXPLORE FIRST:
   - When the user asks to "manage my tasks" or "check my list", ALWAYS start by calling `get_user_projects`.
   - Once you have the project list, identify the relevant project ID (e.g., "Inbox", "Work").
   - Then, IMMEDIATELY call `get_project_with_data(project_id)` to see all existing tasks in that list.
   - DO NOT assume a list is empty. DO NOT create duplicate tasks.

2. CONTEXT AWARENESS:
   - Before creating a new task, check if a similar one exists in the fetched task list.
   - If the user references "that task", look at the most recently fetched tasks in your memory to find the ID.
"""

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.0)

agent = create_agent(llm, tools, system_prompt=system_prompt_text)

def run_agent_cycle():
    print(f"\n--- Starting Cycle: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
    
    # Ensure we are authorized before accepting input
    try:
        authorization()
    except Exception as e:
        print(f"Authorization failed: {e}")
        return

    user_input = input("Enter your command (or 'q' to quit): ")
    if user_input.lower() in ['q', 'quit', 'exit']:
        raise KeyboardInterrupt
        
    try:
        result = agent.invoke({"messages": [("user", user_input)]})
        last_message = result["messages"][-1]
        print("\nResult:", last_message.content)
        
    except Exception as e:
        print(f"Error during execution: {e}")

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
            time.sleep(5)

import time
import os
from datetime import datetime
from typing import Optional, Tuple, List, Dict, Any

# LangChain imports
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import InMemorySaver
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
    """Get details of a specific task by its ID and Project ID.
    
    Args:
        project_id: The ID of the project the task belongs to.
        task_id: The ID of the task to get.
    """
    try:
        return get_client().get_task(project_id, task_id)
    except Exception as e:
        return f"Error fetching task: {str(e)}"

@tool
def create_task(title: str, project_id: str = "inbox", content: str = None, desc: str = None, 
                is_all_day: bool = None, start_date: str = None, due_date: str = None, 
                time_zone: str = None, priority: int = None, reminders: List[str] = None, 
                repeat_flag: str = None, items: List[Dict] = None):
    """
    Create a new task with detailed options.
    
    Args:
        title: Task title.
        project_id: Project ID (defaults to 'inbox').
        content: Task content (summary).
        desc: Detailed task description.
        is_all_day: Boolean for all-day tasks.
        start_date: ISO format string (e.g., '2023-10-27T10:00:00+0000').
        due_date: ISO format string.
        time_zone: Timezone string (e.g., 'America/Los_Angeles').
        priority: Integer (0=None, 1=Low, 3=Medium, 5=High).
        reminders: List of trigger strings (e.g., ['TRIGGER:P0DT9H0M0S']).
        repeat_flag: RRULE string for recurring tasks.
        items: List of subtask dictionaries.
    """
    try:
        # Filter out None values to avoid sending nulls for optional fields
        params = {
            "content": content,
            "desc": desc,
            "isAllDay": is_all_day,
            "startDate": start_date,
            "dueDate": due_date,
            "timeZone": time_zone,
            "priority": priority,
            "reminders": reminders,
            "repeatFlag": repeat_flag,
            "items": items
        }
        # Remove keys with None values
        clean_params = {k: v for k, v in params.items() if v is not None}
        
        return get_client().create_task(title, project_id, **clean_params)
    except Exception as e:
        return f"Error creating task: {str(e)}"

@tool
def update_task(task_id: str, project_id: str, title: str = None, content: str = None, 
                desc: str = None, is_all_day: bool = None, start_date: str = None, 
                due_date: str = None, time_zone: str = None, priority: int = None, status: int = None):
    """
    Update an existing task.
    
    Args:
        task_id: ID of the task to update.
        project_id: Project ID the task belongs to.
        title: New title.
        content: New content.
        desc: New description.
        is_all_day: Update all-day status.
        start_date: Update start date.
        due_date: Update due date.
        time_zone: Update time zone (e.g., 'America/Los_Angeles').
        priority: Update priority (0, 1, 3, 5).
        status: Update status (0=Normal, 2=Completed).
    """
    try:
        params = {
            "title": title,
            "content": content,
            "desc": desc,
            "isAllDay": is_all_day,
            "startDate": start_date,
            "dueDate": due_date,
            "timeZone": time_zone,
            "priority": priority,
            "status": status
        }
        clean_params = {k: v for k, v in params.items() if v is not None}
        
        return get_client().update_task(task_id, project_id, **clean_params)
    except Exception as e:
        return f"Error updating task: {str(e)}"

@tool
def complete_task(task_id: str, project_id: str):
    """Mark a task as completed.
    
    Args:
        task_id: The ID of the task to complete.
        project_id: The ID of the project the task belongs to.
    """
    try:
        return get_client().complete_task(task_id, project_id)
    except Exception as e:
        return f"Error completing task: {str(e)}"

@tool
def delete_task(task_id: str, project_id: str):
    """Delete a task.
    
    Args:
        task_id: The ID of the task to delete.
        project_id: The ID of the project the task belongs to.
    """
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
    """Get details of a specific project/list.
    
    Args:
        project_id: The ID of the project to get.
    """
    try:
        return get_client().get_project(project_id)
    except Exception as e:
        return f"Error fetching project: {str(e)}"

@tool
def get_project_with_data(project_id: str):
    """Get details of a specific project/list with all tasks.
    
    Args:
        project_id: The ID of the project to get.
    """
    try:
        return get_client().get_project_with_data(project_id)
    except Exception as e:
        return f"Error fetching project: {str(e)}"

@tool
def create_project(name: str):
    """Create a new project/list.
    
    Args:
        name: The name of the project to create.
    """
    try:
        return get_client().create_project(name)
    except Exception as e:
        return f"Error creating project: {str(e)}"

@tool
def update_project(project_id: str, name: str):
    """Rename a project.
    
    Args:
        project_id: The ID of the project to update.
        name: The new name for the project.
    """
    try:
        return get_client().update_project(project_id, name)
    except Exception as e:
        return f"Error updating project: {str(e)}"

@tool
def delete_project(project_id: str):
    """Delete a project.
    
    Args:
        project_id: The ID of the project to delete.
    """
    try:
        return get_client().delete_project(project_id)
    except Exception as e:
        return f"Error deleting project: {str(e)}"

@tool
def get_all_tasks_overview():
    """
    Fetches ALL projects and ALL tasks within them in one go.
    Returns a summary organized by Project Name.
    Use this when the user asks for "all tasks".
    """
    try:
        client = get_client()
        projects = client.get_projects()
        
        # Ensure 'Inbox' is explicitly included if not returned by get_projects
        # (TickTick 'inbox' usually has ID 'inbox')
        inbox_found = any(p.get('id') == 'inbox' for p in projects)
        if not inbox_found:
            projects.append({"id": "inbox", "name": "Inbox"})

        overview = {}
        for p in projects:
            p_id = p['id']
            p_name = p.get('name', 'Unknown Project')
            
            try:
                # Fetch tasks for this project
                data = client.get_project_with_data(p_id)
                tasks = data.get('tasks', [])
                
                task_list = []
                for t in tasks:
                    # Only show open tasks (status 0)
                    if t.get('status') == 0: 
                        task_list.append({
                            "title": t.get("title"),
                            "due": t.get("dueDate"),
                            "priority": t.get("priority"),
                            "id": t.get("id") # Include ID so agent can reference it
                        })
                
                if task_list:
                    overview[p_name] = task_list
                else:
                    overview[p_name] = "No open tasks"
                    
            except Exception as e:
                overview[p_name] = f"Error fetching tasks: {str(e)}"
                
        return overview
    except Exception as e:
        return f"Error gathering overview: {str(e)}"

@tool
def get_date_and_time():
    """Get the current date and time."""
    now = datetime.now().astimezone()
    return {
        "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": str(now.tzinfo)
    }

@tool
def get_scheduled_unscheduled_tasks(start_date: str, end_date: str) -> Tuple[List[Dict], List[Dict]]:
    """Schedule unscheduled tasks for the selected days.
    
    Args:
        start_date: The start date to get scheduled and unscheduled tasks for.
        end_date: The end date to get scheduled and unscheduled tasks for.
    """
    try: 
        all_tasks = get_all_tasks_overview()
        scheduled_tasks, unscheduled_tasks = [], []
        for project, tasks in all_tasks.items():
            for task in tasks:
                if task.get('due'):
                    scheduled_tasks.append(task)
                else:
                    unscheduled_tasks.append(task)

        return scheduled_tasks, unscheduled_tasks
    except Exception as e:
        return f"Error scheduling unscheduled tasks: {str(e)}"

    
# Re-use existing tool list
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
    get_all_tasks_overview,
    get_date_and_time,
    get_scheduled_unscheduled_tasks,
]

system_prompt_text = """
You are the **TickTick Agentic Manager**, an expert executive assistant capable of managing complex schedules and projects with precision.

### CORE OBJECTIVES
1.  **Manage:** Organize projects, tasks, and subtasks efficiently.
2.  **Schedule:** Plan events and tasks respecting the user's timezone and working hours.
3.  **Refine:** Improve user inputs by adding detailed descriptions, checklists, and priorities.
4.  **Adapt:** Reschedule dynamically when conflicts arise.

### TOOL USAGE STRATEGY & "GETTING IDS"
You cannot interact with a task (update, complete, delete) without its `task_id` and `project_id`.
*   **Step 1: DISCOVERY.** If you do not have the ID, you MUST search for it first.
    *   Use `get_all_tasks_overview` to see a broad snapshot of open tasks across all projects.
    *   Use `get_project_with_data` if you know the specific list/project name.
*   **Step 2: VERIFICATION.** specific IDs (like `65a9f...`) are required. Never guess an ID.
*   **Step 3: ACTION.** Once you have the ID, proceed with `update_task`, `complete_task`, etc.

### WRITING HIGH-QUALITY DESCRIPTIONS
When creating or updating tasks, always upgrade the `desc` (description) field if the task is non-trivial.
*   **Format:** Use Markdown.
*   **Structure:**
    *   Start with a 1-sentence goal.
    *   Use bullet points for details.
    *   Use `[ ]` checkboxes for sub-steps (or use the `items` argument for actual subtasks).
*   **Example:**
    *   *Bad:* "Fix the bug."
    *   *Good:* "Investigate and fix the login timeout issue.\n\n**Steps:**\n- [ ] Reproduce locally\n- [ ] Check auth logs\n- [ ] Push fix to staging"

### HANDLING DATE & TIME
*   **ALWAYS** call `get_date_and_time` at the start of any scheduling request to ground yourself in the "Now".
*   Relative dates ("next Friday", "tomorrow afternoon") must be calculated relative to this timestamp.
*   When scheduling, check for conflicts using `get_scheduled_unscheduled_tasks` or `get_all_tasks_overview`.

### COMPLEX TASK BREAKDOWN
If a user provides a complex goal (e.g., "Plan a vacation"), do not just make one task.
1.  **Analyze** the goal.
2.  **Break it down** into atomic steps.
3.  **Create** a main task with the high-level goal.
4.  **Add Subtasks** using the `items` list in `create_task` OR create separate tasks in a dedicated Project.

### STANDARD OPERATING PROCEDURE (CoT)
Before answering, perform this internal loop:
1.  **Check Context:** Do I know the current time? Do I have the necessary IDs?
2.  **Gather Info:** Call `get_all_tasks_overview` or `get_projects` if context is missing.
3.  **Reason:** Plan the sequence of actions. (e.g., "Found task X, now I need to move it to next week").
4.  **Execute:** Call the modification tools.
5.  **Confirm:** Report back clearly to the user, summarizing what was changed.

### CRITICAL RULES
*   **NEVER** delete a task without explicit user confirmation unless it is an obvious duplicate you just created.
*   **NEVER** output raw JSON objects to the user. Summarize the result in plain English.
*   **ALWAYS** default `project_id` to "inbox" if unspecified.
"""

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.0)

agent = create_agent(model=llm, tools=tools, system_prompt=system_prompt_text, checkpointer=InMemorySaver())

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
        result = agent.invoke(
            {"messages": [("user", user_input)]}, 
            {"configurable": {"thread_id": "1"}}
            )
        last_message = result["messages"][-1]
        content = last_message.content

        if isinstance(content, list):
            text_output = "".join([
                item.get('text', '')
                for item in content
                if isinstance(item, dict) and item.get('type') == 'text'
            ])
            print("\nResult:", text_output)
        else:
            print("\nResult:", content)
        
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

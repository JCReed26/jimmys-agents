import asyncio
import json 
from datetime import datetime
from pathlib import Path
from graph import build_graph
from state import JobAppState

LOG_FILE = "run_history.json"

def load_history():
    if Path(LOG_FILE).exists():
        with open(LOG_FILE, "r") as f:
            return json.load(f)
    return {"last_run": None, "runs": []}

def save_history(history, log_entry):
    history["last_run"] = datetime.now().isoformat()
    history["runs"].append(log_entry)
    with open(LOG_FILE, "w") as f:
        json.dump(history, f, indent=2)

async def main():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting Job App Chain...")

    # initialize the graph
    app = build_graph()

    # load history
    history = load_history()
    last_run = history["last_run"]
    print(f"Last run was: {last_run}")

    initial_state = JobAppState(
        "scraped_jobs": [],
        "jon_inbox"
    )
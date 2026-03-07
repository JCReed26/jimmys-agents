import asyncio
import json
import os
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
from datetime import datetime
from pathlib import Path
from graph import build_graph
from state import JobAppState


LOG_FILE = os.environ.get("JOB_HISTORY_FILE", "../data/run_history.json")

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

    # Initial State Configuration
    # You can override these with environment variables or command line args
    initial_state = JobAppState(
        search_term=os.getenv("JOB_SEARCH_TERM", "Software Engineer"),
        location=os.getenv("JOB_LOCATION", "Remote"),
        results_wanted=int(os.getenv("JOB_RESULTS_WANTED", 10)),
        hours_old=int(os.getenv("JOB_HOURS_OLD", 24)),
        scraped_jobs=[],
        new_jobs=[],
        approved_jobs=[],
        optimized_jobs=[],
        rejected_jobs=[],
        tracked_jobs=[],
        existing_urls=[],
        error_message=None
    )

    try:
        # Run the graph
        # Since we are using LangGraph, we can invoke it directly
        result = await app.ainvoke(initial_state)
        
        # Log success
        new_jobs_count = len(result.get("new_jobs", []))
        optimized_jobs_count = len(result.get("optimized_jobs", []))
        
        error_msg = result.get("error_message")
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "status": "success" if not error_msg else "partial_error",
            "new_jobs_found": new_jobs_count,
            "optimized_jobs_processed": optimized_jobs_count,
            **({"error": error_msg} if error_msg else {})
        }
        print(f"Cycle Complete. Found {new_jobs_count} new jobs. Optimized {optimized_jobs_count} jobs.")

    except Exception as e:
        print(f"Error running graph: {e}")
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "status": "error",
            "error": str(e)
        }
        # Safety net: try to unlock the sheet if the graph crashed before writer ran
        try:
            from nodes.sheets import get_sheet_manager
            get_sheet_manager().unlock_sheet()
            print("Emergency sheet unlock complete.")
        except Exception as unlock_err:
            print(f"Emergency unlock failed: {unlock_err}")
        
    save_history(history, log_entry)

if __name__ == "__main__":
    asyncio.run(main())

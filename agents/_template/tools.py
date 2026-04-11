"""Tool definitions for the template agent."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

import httpx
from langchain_core.tools import tool
from langchain_tavily import TavilySearch

_tavily_api_key = os.environ.get("TAVILY_API_KEY", "")
tavily_search = TavilySearch(
    max_results=5,
    tavily_api_key=_tavily_api_key if _tavily_api_key else "placeholder",
)

@tool
def fetch_url(url: str) -> str:
    """Fetch the text content of a URL. Use after search to read full articles."""
    try:
        r = httpx.get(url, timeout=10, follow_redirects=True)
        r.raise_for_status()
        return r.text[:6000]
    except Exception as e:
        return f"Error fetching {url}: {e}"

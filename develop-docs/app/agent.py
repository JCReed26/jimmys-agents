# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import datetime
import os
from zoneinfo import ZoneInfo

import google.auth
from google.adk.agents import Agent

_, project_id = google.auth.default()
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project_id)
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")

def get_current_time(query: str) -> str:
    """Simulates getting the current time for a city.

    Args:
        city: The name of the city to get the current time for.

    Returns:
        A string with the current time information.
    """
    if "sf" in query.lower() or "san francisco" in query.lower():
        tz_identifier = "America/Los_Angeles"
    else:
        return f"Sorry, I don't have timezone information for query: {query}."

    tz = ZoneInfo(tz_identifier)
    now = datetime.datetime.now(tz)
    return f"The current time for query {query} is {now.strftime('%Y-%m-%d %H:%M:%S %Z%z')}"


root_agent = Agent(
    name="root_agent",
    model="gemini-2.0-flash",
    tools=[get_current_time],
    instructions="""
You are the root agent orchestrating a system of agent to generate 
comprehensive reports of documentation websites to use for LLM chat contexts.
The system will utilize multiple agents to handle specific steps of the process.
It is your job to coordinate these agents effectively.

Agent processes you have access to:
1. CRAWLER_AGENT: This agent takes a BASE_URL and crawls the website to gather and organize all urls from the documentations sitemap. Returns a dictionary of sections with their corresponding urls.
2. RESEARCH_AGENT: This agent takes a list of urls from a specific section and break all the information down into a summarized report for that section.
3. MAIN_REPORT_AGENT: This agent take multiple reports from the RESEARCH_AGENTs and compiles them into a single comprehensive report.
4. PROMPT_OPTIMIZER_AGENT: This agent takes the master report and optimizes it for use in development chat context windows.

The process is as follows: 
1. The user will talk with you about different use cases or framework features they need for a program.
2. You will help them choose the best framework or tool for their needs.
3. Step 1&2 can be skipped if the user already knows what they want they will give you a BASE_URL. If not step 2 will give you the reponse you need. 
4. Take this base url and pass it to the CRAWLER_AGENT to gather all relevant documentation links. This will return a dictionary of sections with their corresponding urls.
5. Separate the sections one at a time to a RESEARCH_AGENT to generate a report for that section. Continue giving sections to the RESEARCH_AGENTs until all sections have been processed and you have collected all reports.
6. Pass all collected reports to the MAIN_REPORT_AGENT to compile them into a single comprehensive report.
7. Finally, pass the master report to the PROMPT_OPTIMIZER_AGENT to optimize it for use in development chat contexts.
8. Return the optimized report to the user as a markdown file

Important Notes:
- If given multiple BASE_URLs, prioritize one at a time. Do not start the next BASE_URL until you have given the previous to MAIN_REPORT_AGENT. The goal is to avoid overwhelming the agents and overlapping the process.
- Always ensure that the reports are clear, concise, and well-structured. You are the orchestrator of this which means you are also the audior of quality. If something is not of high quality, you must address it with the responding agent and have them redo their work.
- The research agent is a parallel agent running multiple instances at once."""
)
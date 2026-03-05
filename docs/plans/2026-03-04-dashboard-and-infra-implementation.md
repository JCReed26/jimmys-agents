# Dashboard + Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `a-dashboard` (FastAPI + Vanilla JS, dark terminal aesthetic), clean up file structure, add per-agent Dockerfiles + pinned requirements, secure secrets handling, and SQLite+LangSmith metrics — without touching `job-app-chain/`.

**Architecture:** Each agent is served by `langgraph up` on ports 8001–8004. The dashboard is a FastAPI app on port 8080 that polls agent health, reads SQLite metrics, and proxies chat via SSE. A shared `BaseCallbackHandler` writes run metrics to SQLite and optionally to LangSmith.

**Tech Stack:** Python 3.13, FastAPI, LangGraph CLI (langgraph up), Vanilla JS Web Components, SQLite (aiosqlite), LangChain callbacks, LangSmith (optional), Docker + docker-compose, JetBrains Mono (Google Fonts)

---

## Phase 1: Repo Cleanup & Secrets Structure

### Task 1: Update .gitignore and create directory scaffolding

**Files:**
- Modify: `.gitignore`
- Create: `secrets/.gitkeep`
- Create: `data/.gitkeep`
- Create: `shared/__init__.py`

**Step 1: Add secrets/ and data/ to .gitignore**

Replace the token file entries in `.gitignore` with:
```
# Secrets (volume-mounted in Docker, never baked into images)
secrets/
data/

# Legacy locations (kept during migration)
credentials.json
calendar_token.json
sheets_token.json
token.json
budget_state.json
.token-oauth
```

**Step 2: Create the directories with .gitkeep**

```bash
mkdir -p secrets data shared
touch secrets/.gitkeep data/.gitkeep shared/__init__.py
```

**Step 3: Add a README to secrets/ so future-you knows what goes there**

Create `secrets/README.md` (gitignored via the `secrets/` rule above — wait, that gitignores the whole dir. So this file won't be committed. Skip this, the CLAUDE.md documents it.)

**Step 4: Commit**

```bash
git add .gitignore secrets/.gitkeep data/.gitkeep shared/__init__.py
git commit -m "feat: add secrets/ and data/ dirs, update .gitignore"
```

---

### Task 2: Create shared/auth.py — Google OAuth helper

**Files:**
- Create: `shared/auth.py`
- Test: `tests/shared/test_auth.py`

**Context:** `calendar-agent` and `budget-agent` both have identical ~40-line `get_*_service()` functions doing Google OAuth. Extract the common pattern.

**Step 1: Write the failing test**

Create `tests/shared/test_auth.py`:
```python
import pytest
from unittest.mock import patch, MagicMock
from shared.auth import get_google_service

def test_get_google_service_raises_if_no_credentials(tmp_path):
    """Should raise FileNotFoundError when credentials.json missing."""
    with patch("shared.auth.os.path.exists", return_value=False):
        with pytest.raises(FileNotFoundError, match="credentials.json"):
            get_google_service(
                scopes=["https://www.googleapis.com/auth/calendar"],
                token_path=str(tmp_path / "token.json"),
                credentials_path=str(tmp_path / "credentials.json"),
                service_name="calendar",
                service_version="v3",
            )

def test_get_google_service_loads_valid_token(tmp_path):
    """Should load credentials from token file when valid."""
    mock_creds = MagicMock()
    mock_creds.valid = True

    with patch("shared.auth.Credentials.from_authorized_user_file", return_value=mock_creds):
        with patch("shared.auth.os.path.exists", return_value=True):
            with patch("shared.auth.build") as mock_build:
                get_google_service(
                    scopes=["https://www.googleapis.com/auth/calendar"],
                    token_path=str(tmp_path / "token.json"),
                    credentials_path=str(tmp_path / "credentials.json"),
                    service_name="calendar",
                    service_version="v3",
                )
                mock_build.assert_called_once_with("calendar", "v3", credentials=mock_creds)
```

**Step 2: Run test to verify it fails**

```bash
cd /path/to/jimmys-agents
python -m pytest tests/shared/test_auth.py -v
```
Expected: `ModuleNotFoundError: No module named 'shared.auth'`

**Step 3: Write shared/auth.py**

```python
import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build


def get_google_service(
    scopes: list[str],
    token_path: str,
    credentials_path: str,
    service_name: str,
    service_version: str,
):
    """Authenticate and return a Google API service client.

    Loads token from token_path, refreshes if expired, runs OAuth flow
    if no valid token exists. Saves new tokens back to token_path.

    Raises:
        FileNotFoundError: If credentials_path does not exist when needed.
    """
    creds = None

    if os.path.exists(token_path):
        try:
            creds = Credentials.from_authorized_user_file(token_path, scopes)
        except Exception:
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                creds = None

        if not creds:
            if not os.path.exists(credentials_path):
                raise FileNotFoundError(
                    f"Missing credentials.json at {credentials_path}. "
                    "Download it from Google Cloud Console."
                )
            flow = InstalledAppFlow.from_client_secrets_file(credentials_path, scopes)
            creds = flow.run_local_server(port=0)

        with open(token_path, "w") as f:
            f.write(creds.to_json())

    return build(service_name, service_version, credentials=creds)
```

**Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/shared/test_auth.py -v
```
Expected: 2 PASSED

**Step 5: Commit**

```bash
git add shared/auth.py tests/shared/test_auth.py
git commit -m "feat: add shared Google OAuth helper"
```

---

### Task 3: Create shared/metrics_callback.py

**Files:**
- Create: `shared/metrics_callback.py`
- Create: `data/` (already exists from Task 1)
- Test: `tests/shared/test_metrics_callback.py`

**Context:** A LangChain `BaseCallbackHandler` that writes per-run metrics to SQLite. LangSmith is enabled automatically if `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` are in the environment — no extra code needed for that.

**Step 1: Write the failing test**

Create `tests/shared/test_metrics_callback.py`:
```python
import json
import sqlite3
import time
import pytest
from unittest.mock import MagicMock
from shared.metrics_callback import MetricsCallback, init_db

@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test_metrics.db")
    init_db(path)
    return path

def test_init_db_creates_table(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_runs'")
    assert cursor.fetchone() is not None
    conn.close()

def test_run_recorded_on_chain_end(db_path):
    cb = MetricsCallback(agent_name="test-agent", db_path=db_path)
    cb.on_chain_start({}, {})
    cb.on_llm_end(MagicMock(llm_output={"token_usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}}))
    cb.on_chain_end({})

    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT agent_name, total_tokens, error FROM agent_runs").fetchone()
    conn.close()

    assert row[0] == "test-agent"
    assert row[1] == 30
    assert row[2] is None

def test_error_recorded_on_chain_error(db_path):
    cb = MetricsCallback(agent_name="test-agent", db_path=db_path)
    cb.on_chain_start({}, {})
    cb.on_chain_error(ValueError("something broke"))

    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT error FROM agent_runs").fetchone()
    conn.close()

    assert "something broke" in row[0]

def test_tool_calls_recorded(db_path):
    cb = MetricsCallback(agent_name="test-agent", db_path=db_path)
    cb.on_chain_start({}, {})
    cb.on_tool_start({"name": "search_gmail"}, "input")
    time.sleep(0.01)
    cb.on_tool_end("output")
    cb.on_chain_end({})

    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT tool_calls FROM agent_runs").fetchone()
    conn.close()

    tool_calls = json.loads(row[0])
    assert len(tool_calls) == 1
    assert tool_calls[0]["name"] == "search_gmail"
    assert tool_calls[0]["duration_ms"] > 0
```

**Step 2: Run test to verify it fails**

```bash
python -m pytest tests/shared/test_metrics_callback.py -v
```
Expected: `ModuleNotFoundError: No module named 'shared.metrics_callback'`

**Step 3: Write shared/metrics_callback.py**

```python
import json
import sqlite3
import time
import uuid
import os
from typing import Any, Optional
from langchain_core.callbacks import BaseCallbackHandler

DB_PATH = os.environ.get("METRICS_DB_PATH", "data/metrics.db")


def init_db(db_path: str = DB_PATH):
    """Create the agent_runs table if it doesn't exist."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_runs (
            id                TEXT PRIMARY KEY,
            agent_name        TEXT NOT NULL,
            started_at        INTEGER NOT NULL,
            ended_at          INTEGER,
            duration_ms       INTEGER,
            llm_calls         INTEGER DEFAULT 0,
            tool_calls        TEXT,
            total_tokens      INTEGER,
            prompt_tokens     INTEGER,
            completion_tokens INTEGER,
            error             TEXT,
            langsmith_run_id  TEXT
        )
    """)
    conn.commit()
    conn.close()


class MetricsCallback(BaseCallbackHandler):
    """Writes per-run metrics to SQLite. LangSmith handled via env vars."""

    def __init__(self, agent_name: str, db_path: str = DB_PATH):
        self.agent_name = agent_name
        self.db_path = db_path
        init_db(db_path)
        self._reset()

    def _reset(self):
        self._run_id = str(uuid.uuid4())
        self._started_at: Optional[int] = None
        self._llm_calls = 0
        self._tool_calls: list[dict] = []
        self._total_tokens = 0
        self._prompt_tokens = 0
        self._completion_tokens = 0
        self._current_tool_start: Optional[float] = None
        self._current_tool_name: Optional[str] = None

    def on_chain_start(self, serialized, inputs, **kwargs):
        self._reset()
        self._started_at = int(time.time() * 1000)

    def on_llm_end(self, response, **kwargs):
        self._llm_calls += 1
        usage = getattr(response, "llm_output", {}) or {}
        token_usage = usage.get("token_usage", {})
        self._total_tokens += token_usage.get("total_tokens", 0)
        self._prompt_tokens += token_usage.get("prompt_tokens", 0)
        self._completion_tokens += token_usage.get("completion_tokens", 0)

    def on_tool_start(self, serialized, input_str, **kwargs):
        self._current_tool_name = serialized.get("name", "unknown")
        self._current_tool_start = time.time()

    def on_tool_end(self, output, **kwargs):
        if self._current_tool_start:
            duration_ms = int((time.time() - self._current_tool_start) * 1000)
            self._tool_calls.append({
                "name": self._current_tool_name,
                "duration_ms": duration_ms,
                "success": True,
                "output_len": len(str(output)),
            })
        self._current_tool_start = None
        self._current_tool_name = None

    def on_tool_error(self, error, **kwargs):
        if self._current_tool_start:
            duration_ms = int((time.time() - self._current_tool_start) * 1000)
            self._tool_calls.append({
                "name": self._current_tool_name,
                "duration_ms": duration_ms,
                "success": False,
                "output_len": 0,
            })
        self._current_tool_start = None

    def on_chain_end(self, outputs, **kwargs):
        self._write_run(error=None)

    def on_chain_error(self, error, **kwargs):
        self._write_run(error=str(error))

    def _write_run(self, error: Optional[str]):
        if not self._started_at:
            return
        ended_at = int(time.time() * 1000)
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            """INSERT OR REPLACE INTO agent_runs
               (id, agent_name, started_at, ended_at, duration_ms,
                llm_calls, tool_calls, total_tokens, prompt_tokens,
                completion_tokens, error)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                self._run_id, self.agent_name, self._started_at, ended_at,
                ended_at - self._started_at, self._llm_calls,
                json.dumps(self._tool_calls), self._total_tokens,
                self._prompt_tokens, self._completion_tokens, error,
            )
        )
        conn.commit()
        conn.close()
```

**Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/shared/test_metrics_callback.py -v
```
Expected: 4 PASSED

**Step 5: Commit**

```bash
git add shared/metrics_callback.py tests/shared/test_metrics_callback.py
git commit -m "feat: add MetricsCallback writing to SQLite"
```

---

## Phase 2: Per-Agent Docker + LangGraph Setup

> Pattern is the same for all 4 agents. Do one at a time. Start with gmail-agent as it's the simplest.

### Task 4: gmail-agent — Dockerfile, requirements.txt, langgraph.json, add callback

**Files:**
- Create: `gmail-agent/Dockerfile`
- Create: `gmail-agent/requirements.txt`
- Create: `gmail-agent/langgraph.json`
- Modify: `gmail-agent/gmail-agent.py`

**Step 1: Create gmail-agent/requirements.txt**

```
langchain>=1.0
langgraph>=0.2
langgraph-cli[inmem]>=0.1
langchain-google-genai>=2.0
langchain-google-community[gmail]>=2.0
google-auth-oauthlib>=1.2
python-dotenv>=1.0
langsmith>=0.1
```

**Step 2: Create gmail-agent/Dockerfile**

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# shared/ is mounted at runtime via PYTHONPATH
CMD ["langgraph", "up", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 3: Create gmail-agent/langgraph.json**

```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./gmail-agent.py:agent_executor"
  }
}
```

**Step 4: Add MetricsCallback to gmail-agent.py**

At the top of `gmail-agent/gmail-agent.py`, add the import:
```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from shared.metrics_callback import MetricsCallback
```

Update the `agent_executor` creation to pass the callback:
```python
metrics_cb = MetricsCallback(agent_name="gmail-agent")

agent_executor = create_agent(
    model=llm,
    tools=tools,
    system_prompt=system_prompt,
    callbacks=[metrics_cb],
)
```

**Step 5: Verify import works locally**

```bash
cd gmail-agent
python -c "from gmail-agent import agent_executor; print('OK')"
```
Expected: `OK` (or auth error — that's fine, import succeeded)

**Step 6: Commit**

```bash
git add gmail-agent/Dockerfile gmail-agent/requirements.txt gmail-agent/langgraph.json gmail-agent/gmail-agent.py
git commit -m "feat: add Docker + LangGraph server setup for gmail-agent"
```

---

### Task 5: calendar-agent — Dockerfile, requirements.txt, langgraph.json, refactor to shared auth

**Files:**
- Create: `calendar-agent/Dockerfile`
- Create: `calendar-agent/requirements.txt`
- Create: `calendar-agent/langgraph.json`
- Modify: `calendar-agent/calendar-agent.py`

**Step 1: Create calendar-agent/requirements.txt**

```
langchain>=1.0
langgraph>=0.2
langgraph-cli[inmem]>=0.1
langchain-google-genai>=2.0
google-auth-oauthlib>=1.2
google-api-python-client>=2.0
python-dotenv>=1.0
langsmith>=0.1
```

**Step 2: Create calendar-agent/Dockerfile**

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["langgraph", "up", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 3: Create calendar-agent/langgraph.json**

```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./calendar-agent.py:agent"
  }
}
```

**Step 4: Replace get_calendar_service() in calendar-agent.py with shared/auth.py**

Remove the entire `get_calendar_service()` function and its imports. Replace with:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from shared.auth import get_google_service
from shared.metrics_callback import MetricsCallback

SCOPES = ["https://www.googleapis.com/auth/calendar"]

try:
    calendar_service = get_google_service(
        scopes=SCOPES,
        token_path="/app/secrets/calendar_token.json",
        credentials_path="/app/secrets/credentials.json",
        service_name="calendar",
        service_version="v3",
    )
except Exception as e:
    print(f"Failed to connect to Calendar API: {e}")
    exit(1)
```

Also update `create_agent(...)` to add `callbacks=[MetricsCallback(agent_name="calendar-agent")]`.

**Step 5: Commit**

```bash
git add calendar-agent/
git commit -m "feat: add Docker + LangGraph server setup for calendar-agent, use shared auth"
```

---

### Task 6: budget-agent — Dockerfile, requirements.txt, langgraph.json, refactor to shared auth

**Files:**
- Create: `budget-agent/Dockerfile`
- Create: `budget-agent/requirements.txt`
- Create: `budget-agent/langgraph.json`
- Modify: `budget-agent/budget-agent.py`

**Step 1: Create budget-agent/requirements.txt**

```
langchain>=1.0
langgraph>=0.2
langgraph-cli[inmem]>=0.1
langchain-google-genai>=2.0
langchain-google-community[sheets]>=2.0
google-auth-oauthlib>=1.2
google-api-python-client>=2.0
python-dotenv>=1.0
pydantic>=2.0
langsmith>=0.1
```

**Step 2: Create budget-agent/Dockerfile**

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["langgraph", "up", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 3: Create budget-agent/langgraph.json**

```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./budget-agent.py:agent"
  }
}
```

**Step 4: Replace get_spreadsheet_service() with shared/auth.py in budget-agent.py**

Remove `get_spreadsheet_service()` function. Replace:
```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from shared.auth import get_google_service
from shared.metrics_callback import MetricsCallback

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

try:
    service = get_google_service(
        scopes=SCOPES,
        token_path="/app/secrets/sheets_token.json",
        credentials_path="/app/secrets/credentials.json",
        service_name="sheets",
        service_version="v4",
    )
    ...
```

Update state file path to `/app/data/budget_state.json`. Add `MetricsCallback` to the agent.

**Step 5: Commit**

```bash
git add budget-agent/
git commit -m "feat: add Docker + LangGraph server setup for budget-agent, use shared auth"
```

---

### Task 7: ticktick-agent — Dockerfile, requirements.txt, langgraph.json, update token path

**Files:**
- Create: `ticktick-agent/Dockerfile`
- Create: `ticktick-agent/requirements.txt`
- Create: `ticktick-agent/langgraph.json`
- Modify: `ticktick-agent/ticktick_client.py`

**Step 1: Create ticktick-agent/requirements.txt**

```
langchain>=1.0
langgraph>=0.2
langgraph-cli[inmem]>=0.1
langchain-google-genai>=2.0
python-dotenv>=1.0
requests>=2.31
langsmith>=0.1
```

**Step 2: Create ticktick-agent/Dockerfile**

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["langgraph", "up", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 3: Create ticktick-agent/langgraph.json**

```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./ticktick-agent.py:agent"
  }
}
```

**Step 4: Update token path in ticktick_client.py**

Change line:
```python
self.token_file = ".token-oauth"
```
to:
```python
self.token_file = os.environ.get("TICKTICK_TOKEN_PATH", "/app/secrets/.token-oauth")
```

**Step 5: Add MetricsCallback to ticktick-agent.py**

```python
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from shared.metrics_callback import MetricsCallback

agent = create_agent(
    model=llm,
    tools=tools,
    system_prompt=system_prompt_text,
    checkpointer=InMemorySaver(),
    callbacks=[MetricsCallback(agent_name="ticktick-agent")],
)
```

**Step 6: Commit**

```bash
git add ticktick-agent/
git commit -m "feat: add Docker + LangGraph server setup for ticktick-agent, update token path"
```

---

## Phase 3: docker-compose.yml

### Task 8: Root docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

**Step 1: Write docker-compose.yml**

```yaml
services:
  gmail-agent:
    build: ./gmail-agent
    ports:
      - "8001:8000"
    env_file: .env
    volumes:
      - ./secrets:/app/secrets:ro
      - ./data:/app/data
    environment:
      - PYTHONPATH=/app/..

  calendar-agent:
    build: ./calendar-agent
    ports:
      - "8002:8000"
    env_file: .env
    volumes:
      - ./secrets:/app/secrets:ro
    environment:
      - PYTHONPATH=/app/..

  budget-agent:
    build: ./budget-agent
    ports:
      - "8003:8000"
    env_file: .env
    volumes:
      - ./secrets:/app/secrets:ro
      - ./data:/app/data
    environment:
      - PYTHONPATH=/app/..

  ticktick-agent:
    build: ./ticktick-agent
    ports:
      - "8004:8000"
    env_file: .env
    volumes:
      - ./secrets:/app/secrets:ro
    environment:
      - PYTHONPATH=/app/..
      - TICKTICK_TOKEN_PATH=/app/secrets/.token-oauth

  a-dashboard:
    build: ./a-dashboard
    ports:
      - "8080:8080"
    env_file: .env
    volumes:
      - ./data:/app/data:ro
    environment:
      - AGENT_GMAIL_URL=http://gmail-agent:8000
      - AGENT_CALENDAR_URL=http://calendar-agent:8000
      - AGENT_BUDGET_URL=http://budget-agent:8000
      - AGENT_TICKTICK_URL=http://ticktick-agent:8000
```

**Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add root docker-compose.yml for all services"
```

---

## Phase 4: a-dashboard Backend

### Task 9: a-dashboard FastAPI app skeleton + db.py

**Files:**
- Create: `a-dashboard/requirements.txt`
- Create: `a-dashboard/Dockerfile`
- Create: `a-dashboard/db.py`
- Create: `a-dashboard/main.py`
- Test: `tests/a-dashboard/test_db.py`

**Step 1: Create a-dashboard/requirements.txt**

```
fastapi>=0.110
uvicorn[standard]>=0.29
aiohttp>=3.9
aiosqlite>=0.20
jinja2>=3.1
python-dotenv>=1.0
```

**Step 2: Create a-dashboard/Dockerfile**

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**Step 3: Write failing test for db.py**

Create `tests/a-dashboard/test_db.py`:
```python
import pytest
import sqlite3
import asyncio
from a_dashboard.db import get_agent_stats, get_recent_runs

@pytest.fixture
def db_with_data(tmp_path):
    """Seed a test SQLite db with 3 runs for gmail-agent."""
    db_path = str(tmp_path / "metrics.db")
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE agent_runs (
            id TEXT PRIMARY KEY, agent_name TEXT, started_at INTEGER,
            ended_at INTEGER, duration_ms INTEGER, llm_calls INTEGER,
            tool_calls TEXT, total_tokens INTEGER, prompt_tokens INTEGER,
            completion_tokens INTEGER, error TEXT, langsmith_run_id TEXT
        )
    """)
    runs = [
        ("r1", "gmail-agent", 1000, 2000, 1000, 2, '[{"name":"search","duration_ms":100}]', 500, 300, 200, None, None),
        ("r2", "gmail-agent", 3000, 4500, 1500, 3, '[{"name":"search","duration_ms":200}]', 700, 400, 300, None, None),
        ("r3", "gmail-agent", 5000, 5200, 200, 1, '[]', 100, 80, 20, "timeout", None),
    ]
    conn.executemany("INSERT INTO agent_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", runs)
    conn.commit()
    conn.close()
    return db_path

def test_get_agent_stats_calculates_correctly(db_with_data):
    stats = asyncio.run(get_agent_stats("gmail-agent", db_path=db_with_data))
    assert stats["total_runs"] == 3
    assert stats["success_rate"] == pytest.approx(66.7, rel=0.01)
    assert stats["avg_duration_ms"] == pytest.approx(900.0)
    assert stats["top_tools"][0]["name"] == "search"

def test_get_recent_runs_returns_last_20(db_with_data):
    runs = asyncio.run(get_recent_runs("gmail-agent", db_path=db_with_data))
    assert len(runs) == 3
    assert runs[0]["id"] == "r3"  # most recent first
```

**Step 4: Run test to verify it fails**

```bash
python -m pytest tests/a-dashboard/test_db.py -v
```
Expected: `ModuleNotFoundError`

**Step 5: Write a-dashboard/db.py**

```python
import json
import os
import aiosqlite
from collections import Counter

DB_PATH = os.environ.get("METRICS_DB_PATH", "/app/data/metrics.db")


async def get_agent_stats(agent_name: str, db_path: str = DB_PATH) -> dict:
    """Return aggregated stats for one agent."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT duration_ms, error, tool_calls FROM agent_runs WHERE agent_name = ?",
            (agent_name,)
        ) as cursor:
            rows = await cursor.fetchall()

    if not rows:
        return {"total_runs": 0, "success_rate": 0, "avg_duration_ms": 0, "top_tools": []}

    total = len(rows)
    successes = sum(1 for r in rows if r["error"] is None)
    durations = [r["duration_ms"] for r in rows if r["duration_ms"]]
    avg_duration = sum(durations) / len(durations) if durations else 0

    tool_counter: Counter = Counter()
    for row in rows:
        calls = json.loads(row["tool_calls"] or "[]")
        for call in calls:
            tool_counter[call["name"]] += 1

    top_tools = [{"name": k, "count": v} for k, v in tool_counter.most_common(5)]

    return {
        "total_runs": total,
        "success_rate": round((successes / total) * 100, 1),
        "avg_duration_ms": round(avg_duration, 1),
        "top_tools": top_tools,
    }


async def get_recent_runs(agent_name: str, limit: int = 20, db_path: str = DB_PATH) -> list[dict]:
    """Return last N runs for an agent, most recent first."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT id, started_at, duration_ms, llm_calls, total_tokens,
                      error, langsmith_run_id, tool_calls
               FROM agent_runs WHERE agent_name = ?
               ORDER BY started_at DESC LIMIT ?""",
            (agent_name, limit)
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]
```

**Step 6: Write a-dashboard/main.py**

```python
import os
import aiohttp
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from db import get_agent_stats, get_recent_runs

load_dotenv()

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

AGENTS = {
    "gmail-agent":    os.environ.get("AGENT_GMAIL_URL", "http://localhost:8001"),
    "calendar-agent": os.environ.get("AGENT_CALENDAR_URL", "http://localhost:8002"),
    "budget-agent":   os.environ.get("AGENT_BUDGET_URL", "http://localhost:8003"),
    "ticktick-agent": os.environ.get("AGENT_TICKTICK_URL", "http://localhost:8004"),
    "job-app-chain":  None,  # sheet-managed, no HTTP endpoint
}


async def check_agent_health(url: str | None) -> str:
    """Returns RUNNING, IDLE, or DOWN."""
    if url is None:
        return "SHEET"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{url}/ok", timeout=aiohttp.ClientTimeout(total=2)) as r:
                return "RUNNING" if r.status == 200 else "DOWN"
    except Exception:
        return "DOWN"


@app.get("/")
async def index(request: Request):
    agent_data = []
    for name, url in AGENTS.items():
        status = await check_agent_health(url)
        stats = await get_agent_stats(name)
        agent_data.append({"name": name, "status": status, **stats})
    return templates.TemplateResponse("index.html", {"request": request, "agents": agent_data})


@app.get("/agent/{name}")
async def agent_detail(request: Request, name: str):
    url = AGENTS.get(name)
    status = await check_agent_health(url)
    stats = await get_agent_stats(name)
    runs = await get_recent_runs(name)
    return templates.TemplateResponse("agent.html", {
        "request": request,
        "agent": {"name": name, "status": status, "url": url, **stats},
        "runs": runs,
    })


@app.get("/inbox")
async def inbox(request: Request):
    return templates.TemplateResponse("inbox.html", {"request": request})


@app.get("/api/agents")
async def api_agents():
    """JSON endpoint for polling agent card data."""
    result = {}
    for name, url in AGENTS.items():
        status = await check_agent_health(url)
        stats = await get_agent_stats(name)
        result[name] = {"status": status, **stats}
    return result


@app.post("/api/agent/{name}/chat")
async def agent_chat(name: str, request: Request):
    """Proxy chat message to agent's /stream endpoint, return SSE."""
    url = AGENTS.get(name)
    if not url:
        return {"error": "Agent not available for chat"}
    body = await request.json()

    async def event_stream():
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{url}/stream", json=body) as resp:
                async for chunk in resp.content.iter_any():
                    yield chunk

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

**Step 7: Run db tests to verify they pass**

```bash
python -m pytest tests/a-dashboard/test_db.py -v
```
Expected: 2 PASSED

**Step 8: Commit**

```bash
git add a-dashboard/ tests/a-dashboard/
git commit -m "feat: add a-dashboard FastAPI backend with SQLite metrics reader"
```

---

## Phase 5: a-dashboard Frontend

### Task 10: CSS — dark terminal theme with JetBrains Mono

**Files:**
- Create: `a-dashboard/static/css/main.css`

**Step 1: Create the stylesheet**

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap');

:root {
  --bg-base:    #0d0d0d;
  --bg-surface: #141414;
  --bg-card:    #1a1a1a;
  --bg-hover:   #222222;
  --border:     #2a2a2a;
  --border-accent: #333333;

  --text-primary:   #e8e8e8;
  --text-secondary: #888888;
  --text-dim:       #555555;

  --green:   #00ff88;
  --cyan:    #00d4ff;
  --violet:  #7c6af7;
  --red:     #ff4444;
  --yellow:  #ffcc00;

  --font: 'JetBrains Mono', 'Courier New', monospace;
  --radius: 4px;
  --transition: 150ms ease;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font);
  font-size: 13px;
  line-height: 1.6;
  min-height: 100vh;
}

/* ── Layout ─────────────────────────────── */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}

.app-header h1 {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--cyan);
}

.app-header h1 span { color: var(--text-secondary); }

.main-content { padding: 24px; }

/* ── Agent Cards Grid ────────────────────── */
.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

/* ── Agent Card ──────────────────────────── */
.agent-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
  text-decoration: none;
  display: block;
  color: inherit;
}

.agent-card:hover {
  border-color: var(--border-accent);
  background: var(--bg-hover);
}

.agent-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.agent-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}
.agent-name::before { content: '> '; color: var(--cyan); }

/* ── Status Badges ───────────────────────── */
.status-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 2px;
  letter-spacing: 0.05em;
}
.status-running { color: var(--green); border: 1px solid var(--green); }
.status-idle    { color: var(--text-secondary); border: 1px solid var(--border); }
.status-down    { color: var(--red); border: 1px solid var(--red); }
.status-error   { color: var(--yellow); border: 1px solid var(--yellow); }
.status-sheet   { color: var(--violet); border: 1px solid var(--violet); }

/* ── Metrics rows ────────────────────────── */
.metric-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}
.metric-row:last-child { border-bottom: none; }
.metric-label { color: var(--text-secondary); }
.metric-value { color: var(--text-primary); font-weight: 500; }
.metric-value.accent { color: var(--cyan); }

/* ── HITL Badge ──────────────────────────── */
.hitl-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--yellow);
  font-size: 10px;
  font-weight: 600;
}
.hitl-badge::before { content: '▲'; font-size: 8px; }

/* ── Agent Detail Split View ─────────────── */
.agent-detail {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 12px;
  height: calc(100vh - 80px);
}

.detail-left {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-section-title {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  text-transform: uppercase;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}

/* ── Chat Panel ──────────────────────────── */
.chat-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-secondary);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-message { font-size: 12px; line-height: 1.7; }
.chat-message.user { color: var(--cyan); }
.chat-message.user::before { content: 'you: '; color: var(--text-dim); }
.chat-message.agent::before { content: 'agent: '; color: var(--text-dim); }
.chat-message.streaming::after {
  content: '▋';
  animation: blink 1s step-end infinite;
  color: var(--green);
}

@keyframes blink { 50% { opacity: 0; } }

.chat-input-row {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
}

.chat-input {
  flex: 1;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-family: var(--font);
  font-size: 12px;
  padding: 8px 12px;
  outline: none;
  transition: border-color var(--transition);
}
.chat-input:focus { border-color: var(--violet); }
.chat-input::placeholder { color: var(--text-dim); }

.btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-secondary);
  cursor: pointer;
  font-family: var(--font);
  font-size: 11px;
  padding: 6px 14px;
  transition: all var(--transition);
}
.btn:hover { border-color: var(--violet); color: var(--violet); }
.btn-primary { border-color: var(--violet); color: var(--violet); }
.btn-approve { border-color: var(--green); color: var(--green); }
.btn-reject  { border-color: var(--red); color: var(--red); }

/* ── HITL Inbox items ────────────────────── */
.hitl-item {
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 8px;
  font-size: 11px;
}
.hitl-item-header { color: var(--yellow); margin-bottom: 6px; }
.hitl-item-body { color: var(--text-secondary); margin-bottom: 8px; }
.hitl-actions { display: flex; gap: 8px; }

/* ── Run history table ───────────────────── */
.runs-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.runs-table th {
  text-align: left;
  color: var(--text-dim);
  font-weight: 400;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  letter-spacing: 0.06em;
  font-size: 10px;
}
.runs-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
}
.runs-table tr:hover td { color: var(--text-primary); background: var(--bg-hover); }
.run-success { color: var(--green); }
.run-error   { color: var(--red); }

/* ── Nav back link ───────────────────────── */
.back-link {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color var(--transition);
}
.back-link:hover { color: var(--cyan); }

/* ── Inbox page ──────────────────────────── */
.inbox-section { margin-bottom: 24px; }
.inbox-agent-header {
  font-size: 11px;
  color: var(--cyan);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
```

**Step 2: Commit**

```bash
git add a-dashboard/static/css/main.css
git commit -m "feat: add dark terminal CSS theme with JetBrains Mono"
```

---

### Task 11: HTML templates

**Files:**
- Create: `a-dashboard/templates/index.html`
- Create: `a-dashboard/templates/agent.html`
- Create: `a-dashboard/templates/inbox.html`

**Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>jimmy's agents</title>
  <link rel="stylesheet" href="/static/css/main.css">
</head>
<body>
  <header class="app-header">
    <h1>&gt; <span>jimmy's</span> agents</h1>
    <a href="/inbox" class="btn">inbox <span id="global-hitl-count"></span></a>
  </header>
  <main class="main-content">
    <div class="agents-grid" id="agents-grid">
      {% for agent in agents %}
      <a href="/agent/{{ agent.name }}" class="agent-card" data-agent="{{ agent.name }}">
        <div class="agent-card-header">
          <span class="agent-name">{{ agent.name }}</span>
          <span class="status-badge status-{{ agent.status | lower }}">{{ agent.status }}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">avg latency</span>
          <span class="metric-value accent">{{ (agent.avg_duration_ms / 1000) | round(1) }}s</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">total runs</span>
          <span class="metric-value">{{ agent.total_runs }}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">success rate</span>
          <span class="metric-value">{{ agent.success_rate }}%</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">top tool</span>
          <span class="metric-value">{{ agent.top_tools[0].name if agent.top_tools else '—' }}</span>
        </div>
      </a>
      {% endfor %}
    </div>
  </main>
  <script src="/static/js/agent-card.js" type="module"></script>
</body>
</html>
```

**Step 2: Create agent.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{ agent.name }} — jimmy's agents</title>
  <link rel="stylesheet" href="/static/css/main.css">
</head>
<body>
  <header class="app-header">
    <a href="/" class="back-link">← dashboard</a>
    <span class="agent-name" style="font-size:13px">{{ agent.name }}</span>
    <span class="status-badge status-{{ agent.status | lower }}">{{ agent.status }}</span>
  </header>
  <main class="main-content">
    <div class="agent-detail">

      <!-- LEFT: stats + HITL -->
      <div class="detail-left">
        <section>
          <div class="detail-section-title">metrics</div>
          <div class="metric-row">
            <span class="metric-label">avg latency</span>
            <span class="metric-value accent">{{ (agent.avg_duration_ms / 1000) | round(2) }}s</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">total runs</span>
            <span class="metric-value">{{ agent.total_runs }}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">success rate</span>
            <span class="metric-value">{{ agent.success_rate }}%</span>
          </div>
        </section>

        <section>
          <div class="detail-section-title">top tools</div>
          {% for tool in agent.top_tools %}
          <div class="metric-row">
            <span class="metric-label">{{ tool.name }}</span>
            <span class="metric-value">x{{ tool.count }}</span>
          </div>
          {% else %}
          <div style="color:var(--text-dim);font-size:11px">no runs yet</div>
          {% endfor %}
        </section>

        {% if agent.name != 'job-app-chain' %}
        <section>
          <div class="detail-section-title">hitl inbox</div>
          <div id="hitl-inbox-items">
            <div style="color:var(--text-dim);font-size:11px">loading...</div>
          </div>
        </section>
        {% endif %}

        <section>
          <div class="detail-section-title">recent runs</div>
          <table class="runs-table">
            <thead>
              <tr><th>time</th><th>dur</th><th>tools</th><th>status</th></tr>
            </thead>
            <tbody>
              {% for run in runs %}
              <tr>
                <td>{{ run.started_at }}</td>
                <td>{{ (run.duration_ms / 1000) | round(1) }}s</td>
                <td>{{ run.tool_calls | fromjson | length if run.tool_calls else 0 }}</td>
                <td class="{{ 'run-success' if not run.error else 'run-error' }}">
                  {{ '✓' if not run.error else '✗' }}
                </td>
              </tr>
              {% endfor %}
            </tbody>
          </table>
        </section>
      </div>

      <!-- RIGHT: chat -->
      <div class="chat-panel" id="chat-panel"
           data-agent="{{ agent.name }}"
           data-available="{{ 'true' if agent.url and agent.status != 'DOWN' else 'false' }}">
        <div class="chat-header">&gt; {{ agent.name }} // chat</div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-row">
          <input class="chat-input" id="chat-input"
                 placeholder="{{ '> _' if agent.status != 'DOWN' else 'agent offline' }}"
                 {{ 'disabled' if agent.status == 'DOWN' or agent.name == 'job-app-chain' }}>
          <button class="btn btn-primary" id="chat-send">send</button>
        </div>
      </div>

    </div>
  </main>
  <script src="/static/js/chat-panel.js" type="module"></script>
</body>
</html>
```

**Step 3: Create inbox.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>inbox — jimmy's agents</title>
  <link rel="stylesheet" href="/static/css/main.css">
</head>
<body>
  <header class="app-header">
    <a href="/" class="back-link">← dashboard</a>
    <h1>&gt; <span>global</span> inbox</h1>
    <span></span>
  </header>
  <main class="main-content">
    <div id="inbox-content">
      <div style="color:var(--text-dim);font-size:12px">loading pending items...</div>
    </div>
  </main>
  <script src="/static/js/agent-detail.js" type="module"></script>
</body>
</html>
```

**Step 4: Commit**

```bash
git add a-dashboard/templates/
git commit -m "feat: add dashboard HTML templates"
```

---

### Task 12: JavaScript Web Components

**Files:**
- Create: `a-dashboard/static/js/agent-card.js`
- Create: `a-dashboard/static/js/chat-panel.js`
- Create: `a-dashboard/static/js/agent-detail.js`

**Step 1: Create agent-card.js (polls /api/agents every 10s, updates status badges)**

```javascript
// Polls /api/agents and refreshes card status/metrics in-place
async function refreshAgentCards() {
  try {
    const res = await fetch('/api/agents');
    const data = await res.json();
    for (const [name, info] of Object.entries(data)) {
      const card = document.querySelector(`[data-agent="${name}"]`);
      if (!card) continue;
      const badge = card.querySelector('.status-badge');
      if (badge) {
        badge.textContent = info.status;
        badge.className = `status-badge status-${info.status.toLowerCase()}`;
      }
    }
  } catch (e) {
    // dashboard works even if poll fails
  }
}

refreshAgentCards();
setInterval(refreshAgentCards, 10_000);
```

**Step 2: Create chat-panel.js (SSE streaming chat)**

```javascript
const panel = document.getElementById('chat-panel');
if (!panel) throw new Error('chat-panel not found');

const agentName = panel.dataset.agent;
const available = panel.dataset.available === 'true';
const messagesEl = document.getElementById('chat-messages');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');

function appendMessage(role, text, streaming = false) {
  const div = document.createElement('div');
  div.className = `chat-message ${role}${streaming ? ' streaming' : ''}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || !available) return;
  inputEl.value = '';
  inputEl.disabled = true;
  sendBtn.disabled = true;

  appendMessage('user', text);
  const agentMsg = appendMessage('agent', '', true);

  try {
    const res = await fetch(`/api/agent/${agentName}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { messages: [{ role: 'human', content: text }] } }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE: parse data: lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const chunk = JSON.parse(line.slice(6));
            const content = chunk?.messages?.at(-1)?.content;
            if (content) agentMsg.textContent = content;
          } catch { /* partial chunk */ }
        }
      }
    }
  } catch (err) {
    agentMsg.textContent = `error: ${err.message}`;
  } finally {
    agentMsg.classList.remove('streaming');
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.focus();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

sendBtn?.addEventListener('click', sendMessage);
inputEl?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
```

**Step 3: Create agent-detail.js (loads HITL inbox items)**

```javascript
// Loads HITL items for global inbox page
async function loadInbox() {
  const container = document.getElementById('inbox-content');
  if (!container) return;

  // Placeholder — real HITL data comes from agent-specific endpoints
  // Each agent exposes GET /hitl and POST /hitl/{id}/approve|reject
  const agents = ['gmail-agent', 'calendar-agent', 'budget-agent', 'ticktick-agent'];
  let html = '';

  for (const name of agents) {
    let items = [];
    try {
      const res = await fetch(`/api/agent/${name}/hitl`);
      if (res.ok) items = await res.json();
    } catch { /* agent offline */ }

    html += `<div class="inbox-section">
      <div class="inbox-agent-header">> ${name} (${items.length} pending)</div>`;

    if (items.length === 0) {
      html += `<div style="color:var(--text-dim);font-size:11px;padding:8px 0">no pending items</div>`;
    } else {
      for (const item of items) {
        html += `
          <div class="hitl-item">
            <div class="hitl-item-header">${item.title || 'Pending approval'}</div>
            <div class="hitl-item-body">${item.description || ''}</div>
            <div class="hitl-actions">
              <button class="btn btn-approve" onclick="handleHITL('${name}','${item.id}','approve')">approve</button>
              <button class="btn btn-reject"  onclick="handleHITL('${name}','${item.id}','reject')">reject</button>
            </div>
          </div>`;
      }
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

async function handleHITL(agentName, itemId, action) {
  await fetch(`/api/agent/${agentName}/hitl/${itemId}/${action}`, { method: 'POST' });
  loadInbox();
}

loadInbox();
```

**Step 4: Commit**

```bash
git add a-dashboard/static/js/
git commit -m "feat: add Vanilla JS Web Components for agent cards and chat"
```

---

## Phase 6: Final Integration & Smoke Test

### Task 13: Remove root requirements.txt, update .gitignore

**Files:**
- Delete: `requirements.txt` (root)
- Modify: `.gitignore`

**Step 1: Remove root requirements.txt**

```bash
git rm requirements.txt
```

**Step 2: Update .gitignore to add test artifacts**

Add to `.gitignore`:
```
# Test artifacts
.pytest_cache/
*.pyc
tests/**/__pycache__/

# Secrets
secrets/
data/
```

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: remove root requirements.txt, update .gitignore"
```

---

### Task 14: Run full test suite

**Step 1: Install test deps**

```bash
pip install pytest pytest-asyncio aiosqlite
```

**Step 2: Run all tests**

```bash
python -m pytest tests/ -v
```

Expected output:
```
tests/shared/test_auth.py::test_get_google_service_raises_if_no_credentials PASSED
tests/shared/test_auth.py::test_get_google_service_loads_valid_token PASSED
tests/shared/test_metrics_callback.py::test_init_db_creates_table PASSED
tests/shared/test_metrics_callback.py::test_run_recorded_on_chain_end PASSED
tests/shared/test_metrics_callback.py::test_error_recorded_on_chain_error PASSED
tests/shared/test_metrics_callback.py::test_tool_calls_recorded PASSED
tests/a-dashboard/test_db.py::test_get_agent_stats_calculates_correctly PASSED
tests/a-dashboard/test_db.py::test_get_recent_runs_returns_last_20 PASSED
```

**Step 3: Fix any failures before proceeding**

**Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve test failures from integration"
```

---

### Task 15: Docker smoke test

**Step 1: Ensure secrets/ has placeholder files so containers start**

```bash
ls secrets/
# Should contain: credentials.json, token.json, calendar_token.json, sheets_token.json, .token-oauth
# If not present, create dummy files for smoke test:
echo '{}' > secrets/credentials.json
```

**Step 2: Build all images**

```bash
docker-compose build
```
Expected: All 5 images build without error.

**Step 3: Start only the dashboard**

```bash
docker-compose up a-dashboard
```
Expected: `Uvicorn running on http://0.0.0.0:8080`

**Step 4: Verify dashboard loads**

Open `http://localhost:8080` — should see the agent cards grid. All agents will show DOWN (no agents running). That's correct.

**Step 5: Commit any Dockerfile fixes**

```bash
git add -A
git commit -m "fix: docker build issues from smoke test"
```

---

### Task 16: Final commit and summary

```bash
git add -A
git commit -m "feat: complete a-dashboard + infra overhaul

- a-dashboard/ with FastAPI, Vanilla JS, dark terminal theme, JetBrains Mono
- Per-agent Dockerfiles, requirements.txt, langgraph.json
- shared/auth.py (Google OAuth helper), shared/metrics_callback.py (SQLite)
- secrets/ and data/ volume structure for secure credential handling
- docker-compose.yml for all services
- Tests for auth helper, metrics callback, and dashboard db layer"
```

---

## Environment Variables Required

Add these to `.env`:
```bash
# Required
GOOGLE_API_KEY=...

# TickTick
TICKTICK_CLIENT_ID=...
TICKTICK_CLIENT_SECRET=...
TICKTICK_REDIRECT_URI=http://localhost:8080/callback

# Optional — enables LangSmith tracing
LANGSMITH_API_KEY=...
LANGSMITH_TRACING=true
LANGSMITH_PROJECT=jimmys-agents

# Metrics DB path (defaults work for Docker)
METRICS_DB_PATH=/app/data/metrics.db
```

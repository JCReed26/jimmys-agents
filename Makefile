.PHONY: install run-frontend run-gmail run-calendar run-budget run-job-search start-all stop-all clean setup

# Detect python 3.13 if available, else fall back to python3
PYTHON := $(shell command -v python3.13 2> /dev/null || echo python3)

setup:
	rm -rf .venv
	$(PYTHON) -m venv .venv
	@echo "Virtual environment created with $(PYTHON). Run 'source .venv/bin/activate' then 'make install'"

install:
	@$(PYTHON) --version
	$(PYTHON) -m pip install -r requirements.txt
	$(PYTHON) -m playwright install
	cd frontend && npm install

run-frontend:
	cd frontend && npm run dev -- -p 3000

run-gmail:
	cd agents/gmail-agent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8001 --no-browser

run-calendar:
	cd agents/calendar-agent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8002 --no-browser

run-budget:
	cd agents/budget-deepagent && ../../.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8003 --reload

run-job-search:
	cd agents/job-search-agent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8005 --no-browser

start-all:
	mkdir -p logs
	nohup sh -c 'cd frontend && npm run dev -- -p 3000' > logs/frontend.log 2>&1 & echo $$! > logs/frontend.pid
	nohup sh -c 'cd agents/gmail-agent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8001 --no-browser' > logs/gmail.log 2>&1 & echo $$! > logs/gmail.pid
	nohup sh -c 'cd agents/calendar-agent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8002 --no-browser' > logs/calendar.log 2>&1 & echo $$! > logs/calendar.pid
	nohup sh -c 'cd agents/budget-deepagent && ../../.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8003' > logs/budget.log 2>&1 & echo $$! > logs/budget.pid
	nohup sh -c 'cd agents/job-search-agent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8005 --no-browser' > logs/job-search.log 2>&1 & echo $$! > logs/job-search.pid
	@echo "All services started. Frontend=:3000 Agents=:8001 :8002 :8003 :8005. Logs in logs/"

stop-all:
	-kill `cat logs/frontend.pid` 2>/dev/null && rm -f logs/frontend.pid
	-kill `cat logs/gmail.pid` 2>/dev/null && rm -f logs/gmail.pid
	-kill `cat logs/calendar.pid` 2>/dev/null && rm -f logs/calendar.pid
	-kill `cat logs/budget.pid` 2>/dev/null && rm -f logs/budget.pid
	-kill `cat logs/job-search.pid` 2>/dev/null && rm -f logs/job-search.pid
	@echo "All services stopped."

clean:
	rm -rf logs/*
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true

clean-logs:
	find logs/ -name "*.log" -size +10M -delete

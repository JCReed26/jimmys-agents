.PHONY: install run-api-server run-frontend run-gmail run-calendar run-budget run-job-chain start-all stop-all clean setup

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

run-api-server:
	.venv/bin/python backend/api_server.py

run-frontend:
	cd frontend && npm run dev -- -p 3000

run-gmail:
	cd agents/gmail-agent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8001 --no-browser

run-calendar:
	cd agents/calendar-agent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8002 --no-browser

run-budget:
	cd agents/budget-deepagent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8003 --no-browser

run-job-chain:
	cd automations/job-app-chain && python main.py

run-job-chain-server:
	cd automations/job-app-chain && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8004 --no-browser

start-all:
	mkdir -p logs data
	nohup sh -c '.venv/bin/python backend/api_server.py' > logs/api-server.log 2>&1 & echo $$! > logs/api-server.pid
	nohup sh -c 'cd frontend && npm run dev -- -p 3000' > logs/frontend.log 2>&1 & echo $$! > logs/frontend.pid
	nohup sh -c 'cd agents/gmail-agent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8001 --no-browser' > logs/gmail.log 2>&1 & echo $$! > logs/gmail.pid
	nohup sh -c 'cd agents/calendar-agent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8002 --no-browser' > logs/calendar.log 2>&1 & echo $$! > logs/calendar.pid
	nohup sh -c 'cd agents/budget-deepagent && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8003 --no-browser' > logs/budget.log 2>&1 & echo $$! > logs/budget.pid
	nohup sh -c 'cd automations/job-app-chain && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8004 --no-browser' > logs/job-chain.log 2>&1 & echo $$! > logs/job-chain.pid
	@echo "All services started. API=:8080 Frontend=:3000 Agents=:8001-8004. Logs in logs/"

stop-all:
	-kill `cat logs/api-server.pid` 2>/dev/null && rm -f logs/api-server.pid
	-kill `cat logs/frontend.pid` 2>/dev/null && rm -f logs/frontend.pid
	-kill `cat logs/gmail.pid` 2>/dev/null && rm -f logs/gmail.pid
	-kill `cat logs/calendar.pid` 2>/dev/null && rm -f logs/calendar.pid
	-kill `cat logs/budget.pid` 2>/dev/null && rm -f logs/budget.pid
	-kill `cat logs/job-chain.pid` 2>/dev/null && rm -f logs/job-chain.pid
	@echo "All services stopped."

clean:
	rm -rf logs/*
	rm -rf */__pycache__
	rm -rf */*.pyc

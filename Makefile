.PHONY: install run-dashboard run-gmail run-calendar run-budget run-job-chain start-all stop-all clean setup

# Detect python 3.13 if available, else fall back to python3
PYTHON := $(shell command -v python3.13 2> /dev/null || echo python3)

setup:
	rm -rf .venv
	$(PYTHON) -m venv .venv
	@echo "Virtual environment created with $(PYTHON). Run 'source .venv/bin/activate' then 'make install'"

install:
	@python3 --version
	pip install -r requirements.txt
	playwright install
	cd next-dashboard && npm install

run-next:
	cd next-dashboard && npm run dev -- -p 8080

run-gmail:
	cd gmail-agent && ../.venv/bin/langgraph dev --host 0.0.0.0 --port 8001

run-calendar:
	cd calendar-agent && ../.venv/bin/langgraph dev --host 0.0.0.0 --port 8002

run-budget:
	cd budget-agent && ../.venv/bin/langgraph dev --host 0.0.0.0 --port 8003

run-job-chain:
	cd job-app-chain && python main.py

run-job-chain-server:
	cd job-app-chain && ../.venv/bin/langgraph dev --host 0.0.0.0 --port 8004

start-all:
	mkdir -p logs
	mkdir -p data
	nohup sh -c 'cd next-dashboard && npm run dev -- -p 8080' > logs/next-dashboard.log 2>&1 & echo $$! > logs/next-dashboard.pid
	nohup sh -c 'cd gmail-agent && ../.venv/bin/langgraph dev --host 0.0.0.0 --port 8001' > logs/gmail.log 2>&1 & echo $$! > logs/gmail.pid
	nohup sh -c 'cd calendar-agent && ../.venv/bin/langgraph dev --host 0.0.0.0 --port 8002' > logs/calendar.log 2>&1 & echo $$! > logs/calendar.pid
	nohup sh -c 'cd budget-agent && ../.venv/bin/langgraph dev --host 0.0.0.0 --port 8003' > logs/budget.log 2>&1 & echo $$! > logs/budget.pid
	nohup sh -c 'cd job-app-chain && ../.venv/bin/langgraph dev --host 0.0.0.0 --port 8004' > logs/job-chain.log 2>&1 & echo $$! > logs/job-chain.pid
	@echo "All services started. Logs in logs/"

stop-all:
	-kill `cat logs/dashboard.pid` && rm logs/dashboard.pid
	-kill `cat logs/next-dashboard.pid` && rm logs/next-dashboard.pid
	-kill `cat logs/gmail.pid` && rm logs/gmail.pid
	-kill `cat logs/calendar.pid` && rm logs/calendar.pid
	-kill `cat logs/budget.pid` && rm logs/budget.pid
	-kill `cat logs/job-chain.pid` && rm logs/job-chain.pid
	@echo "All services stopped."

clean:
	rm -rf logs/*
	rm -rf */__pycache__
	rm -rf */*.pyc

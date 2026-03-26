"""
Run OAuth flow locally for all agents that need Google credentials.
Run from the repo root: python backend/run_auth.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.auth import get_google_service

CREDENTIALS = "secrets/credentials.json"

AGENTS = [
    {
        "name": "gmail-agent",
        "scopes": ["https://mail.google.com/"],
        "token": "secrets/gmail_token.json",
        "service": "gmail",
        "version": "v1",
    },
    {
        "name": "calendar-agent",
        "scopes": ["https://www.googleapis.com/auth/calendar"],
        "token": "secrets/calendar_token.json",
        "service": "calendar",
        "version": "v3",
    },
    {
        "name": "budget-agent (sheets)",
        "scopes": ["https://www.googleapis.com/auth/spreadsheets"],
        "token": "secrets/sheets_token.json",
        "service": "sheets",
        "version": "v4",
    },
]


def main():
    for agent in AGENTS:
        print(f"\n{'='*50}")
        print(f"  {agent['name']}")
        print(f"  Token: {agent['token']}")
        print(f"{'='*50}")

        if os.path.exists(agent["token"]):
            answer = input("Token already exists. Re-generate? [y/N] ").strip().lower()
            if answer != "y":
                print("Skipped.")
                continue
            os.remove(agent["token"])

        print("Opening browser for OAuth authorization...")
        try:
            get_google_service(
                scopes=agent["scopes"],
                token_path=agent["token"],
                credentials_path=CREDENTIALS,
                service_name=agent["service"],
                service_version=agent["version"],
            )
            print(f"Saved: {agent['token']}")
        except Exception as e:
            print(f"FAILED: {e}")

    print("\nDone. Rebuild containers to pick up new tokens:")
    print("  make start-all")


if __name__ == "__main__":
    main()

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
            try:
                creds = flow.run_local_server(port=0)
            except Exception as browser_err:
                raise RuntimeError(
                    f"No valid OAuth token found at {token_path} and cannot open a browser "
                    f"({browser_err}). Run 'python shared/run_auth.py' locally to generate "
                    "tokens, then rebuild the container."
                ) from browser_err

        with open(token_path, "w") as f:
            f.write(creds.to_json())

    return build(service_name, service_version, credentials=creds)

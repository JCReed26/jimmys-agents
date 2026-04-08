"""Google OAuth2 helper — shared by gmail-agent and calendar-agent."""
from pathlib import Path
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


def get_google_service(
    scopes: list[str],
    token_path: str,
    credentials_path: str,
    service_name: str,
    service_version: str,
):
    """Build and return an authenticated Google API service client.

    Uses token_path for stored credentials and credentials_path (OAuth2 client
    secrets JSON from Google Cloud Console) for the initial auth flow.
    """
    creds = None
    token_file = Path(token_path)

    if token_file.exists():
        creds = Credentials.from_authorized_user_file(str(token_file), scopes)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(credentials_path, scopes)
            creds = flow.run_local_server(port=0)
        token_file.parent.mkdir(parents=True, exist_ok=True)
        token_file.write_text(creds.to_json())

    return build(service_name, service_version, credentials=creds)

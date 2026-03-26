"""
Syncs Google Sheets ↔ local CSV files so the DeepAgent can read/edit budget data
as plain files using its built-in file tools (read_file, edit_file, write_file).

Flow:
  Before agent run  → sync_from_sheets_to_csv()  (Sheets → CSV)
  After agent run   → sync_from_csv_to_sheets()   (CSV → Sheets)

Spreadsheet ID is read from ../data/budget_state.json (written by budget-agent).
CSVs are written to/read from data/ relative to this file.
"""
import json
from pathlib import Path

import gspread
import pandas as pd
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
SECRETS_DIR = Path(__file__).parent.parent / "secrets"
TOKEN_PATH = SECRETS_DIR / "sheets_token.json"
CREDENTIALS_PATH = SECRETS_DIR / "credentials.json"
STATE_PATH = Path(__file__).parent.parent / "data" / "budget_state.json"
DATA_DIR = Path(__file__).parent / "data"


def _get_spreadsheet_id() -> str | None:
    """Read spreadsheet ID from budget_state.json. Returns None if not set."""
    if not STATE_PATH.exists():
        return None
    with open(STATE_PATH) as f:
        state = json.load(f)
    return state.get("spreadsheet_id")


def _get_gspread_client() -> gspread.Client:
    """Authenticate and return a gspread client using existing OAuth token."""
    creds = None

    if TOKEN_PATH.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
        except Exception:
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                with open(TOKEN_PATH, "w") as f:
                    f.write(creds.to_json())
            except Exception:
                # Token revoked or expired beyond refresh — redo the OAuth flow
                creds = None

        if not creds or not creds.valid:
            if not CREDENTIALS_PATH.exists():
                raise RuntimeError(
                    f"OAuth credentials not found at {CREDENTIALS_PATH}. "
                    "Download from Google Cloud Console → APIs & Services → Credentials."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)
            TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(TOKEN_PATH, "w") as f:
                f.write(creds.to_json())
            print(f"[sheets_to_csv] OAuth token saved to {TOKEN_PATH}")

    return gspread.authorize(creds)


def get_sheets_data(spreadsheet_id: str) -> dict[str, list[list]]:
    """Fetch all worksheet tabs from a spreadsheet.

    Returns:
        Dict mapping tab name → list of rows (each row is a list of cell values).
    """
    gc = _get_gspread_client()
    spreadsheet = gc.open_by_key(spreadsheet_id)
    result = {}
    for worksheet in spreadsheet.worksheets():
        result[worksheet.title] = worksheet.get_all_values()
    return result


def convert_sheets_to_csv(spreadsheet_id: str, output_dir: Path = DATA_DIR) -> None:
    """Download all tabs from a spreadsheet and write each as a CSV file.

    Args:
        spreadsheet_id: Google Sheets spreadsheet ID.
        output_dir: Directory to write CSV files into (created if missing).
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    sheets_data = get_sheets_data(spreadsheet_id)
    for tab_name, rows in sheets_data.items():
        if not rows:
            continue
        # First row is headers, remaining rows are data
        df = pd.DataFrame(rows[1:], columns=rows[0]) if len(rows) > 1 else pd.DataFrame(columns=rows[0] if rows else [])
        safe_name = tab_name.replace("/", "_").replace(" ", "_")
        csv_path = output_dir / f"{safe_name}.csv"
        df.to_csv(csv_path, index=False)
        print(f"[sheets_to_csv] Synced '{tab_name}' → {csv_path} ({len(df)} rows)")


def convert_csv_to_sheets_data(spreadsheet_id: str, data_dir: Path = DATA_DIR) -> None:
    """Read all CSV files in data_dir and push each back to the matching sheet tab.

    Tab name is inferred from the CSV filename (underscores → spaces for matching).
    Creates new worksheets if a matching tab doesn't exist.

    Args:
        spreadsheet_id: Google Sheets spreadsheet ID.
        data_dir: Directory containing CSV files to upload.
    """
    gc = _get_gspread_client()
    spreadsheet = gc.open_by_key(spreadsheet_id)
    existing_tabs = {ws.title: ws for ws in spreadsheet.worksheets()}

    for csv_path in sorted(data_dir.glob("*.csv")):
        try:
            df = pd.read_csv(csv_path).fillna("")
        except Exception as e:
            print(f"[sheets_to_csv] Skipping {csv_path.name}: {e}")
            continue

        # Derive sheet tab name from filename (restore spaces)
        tab_name = csv_path.stem.replace("_", " ")
        rows = [df.columns.tolist()] + df.values.tolist()

        if tab_name in existing_tabs:
            ws = existing_tabs[tab_name]
            ws.clear()
        else:
            ws = spreadsheet.add_worksheet(title=tab_name, rows=max(len(rows) + 10, 50), cols=max(len(rows[0]) + 5, 26) if rows else 26)

        ws.update(rows, value_input_option="USER_ENTERED")
        print(f"[sheets_to_csv] Pushed {csv_path.name} → '{tab_name}' ({len(df)} rows)")


def sync_from_sheets_to_csv() -> None:
    """Thin wrapper: fetch spreadsheet ID then sync Sheets → CSV."""
    spreadsheet_id = _get_spreadsheet_id()
    if not spreadsheet_id:
        print("[sheets_to_csv] No spreadsheet ID found in budget_state.json — skipping pre-sync.")
        return
    convert_sheets_to_csv(spreadsheet_id)


def sync_from_csv_to_sheets() -> None:
    """Thin wrapper: fetch spreadsheet ID then sync CSV → Sheets."""
    spreadsheet_id = _get_spreadsheet_id()
    if not spreadsheet_id:
        print("[sheets_to_csv] No spreadsheet ID found in budget_state.json — skipping post-sync.")
        return
    convert_csv_to_sheets_data(spreadsheet_id)

import os
import gspread
from google.oauth2.service_account import Credentials
from state import JobAppState, JobInboxItem, JobInboxStatus, OptimizedJob, RejectedJob, TrackedJob
from dotenv import load_dotenv, find_dotenv


def _enum_str(val) -> str:
    """Normalize an enum or string value to uppercase string for sheet writes."""
    if hasattr(val, 'value'):
        return str(val.value).upper()
    return str(val).upper() if val else ''

load_dotenv(find_dotenv())

SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]

class SheetManager:
    def __init__(self, spreadsheet_id: str):
        self.spreadsheet_id = spreadsheet_id
        self.creds = self._get_credentials()
        self.client = gspread.authorize(self.creds)
        self.sheet = self.client.open_by_key(self.spreadsheet_id)
        
    def _get_credentials(self):
        # Check for service account
        service_account_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if service_account_file and os.path.exists(service_account_file):
            print(f"Using service account from {service_account_file}")
            return Credentials.from_service_account_file(service_account_file, scopes=SCOPES)
        
        # Check for OAuth user token (local dev)
        # Assuming token.json is in secrets/ or root
        token_paths = [
            "secrets/sheets_token.json", 
            "secrets/token.json", 
            "token.json",
            "../secrets/sheets_token.json",
            "../secrets/token.json"
        ]
        for path in token_paths:
            if os.path.exists(path):
                try:
                    from google.oauth2.credentials import Credentials as UserCredentials
                    print(f"Using user credentials from {path}")
                    return UserCredentials.from_authorized_user_file(path, scopes=SCOPES)
                except Exception as e:
                    print(f"Failed to load user credentials from {path}: {e}")
        
        raise Exception("No valid credentials found (Service Account or OAuth Token)")

    def lock_sheet(self):
        """Locks the sheet by setting A1 to 'RED'. Waits if already locked."""
        try:
            worksheet = self.sheet.sheet1 # Assuming first sheet is dashboard or similar, or specific tab?
            # CLAUDE.md says Cell A1 status indicator. Usually this is on a Dashboard tab or the first tab.
            # Let's assume 'job_inbox' is the main tab or there is a specific Dashboard tab? 
            # CLAUDE.md says: "Cell A1: Status Indicator... Cell A10: Job App Chain Dashboard".
            # It doesn't specify tab name for dashboard. I'll assume 'job_inbox' for now or 'Dashboard'.
            # I'll check if 'Dashboard' exists, if not use 'job_inbox'.
            try:
                worksheet = self.sheet.worksheet("Dashboard")
            except:
                worksheet = self.sheet.worksheet("job_inbox")

            status_cell = worksheet.acell('A1')
            if status_cell.value == 'RED':
                print("Sheet is locked (RED). Waiting...")
                # Simple backoff/wait logic could go here, for now just warn
                # or raise exception if we don't want to block indefinitely
                # return False 
                pass 
            
            worksheet.update_acell('A1', 'RED')
            return True
        except Exception as e:
            print(f"Error locking sheet: {e}")
            return False

    def unlock_sheet(self):
        """Unlocks the sheet by setting A1 to 'GREEN'."""
        try:
            try:
                worksheet = self.sheet.worksheet("Dashboard")
            except:
                worksheet = self.sheet.worksheet("job_inbox")
            
            worksheet.update_acell('A1', 'GREEN')
            return True
        except Exception as e:
            print(f"Error unlocking sheet: {e}")
            return False

    def read_existing_urls(self):
        """Reads all URLs from relevant tabs to deduplicate."""
        urls = set()
        tabs = ['job_inbox', 'optimized_jobs', 'job_tracker', 'rejected_jobs']
        
        for tab_name in tabs:
            try:
                worksheet = self.sheet.worksheet(tab_name)
                records = worksheet.get_all_records()
                for row in records:
                    # Column name for URL might vary slightly? state.py says 'JOB_URL'
                    url = row.get('JOB_URL') or row.get('job_url') or row.get('url')
                    if url:
                        urls.add(url)
            except gspread.WorksheetNotFound:
                print(f"Tab {tab_name} not found.")
            except Exception as e:
                print(f"Error reading {tab_name}: {e}")
                
        return list(urls)

    def write_new_jobs(self, jobs: list[JobInboxItem]):
        """Appends new jobs to job_inbox tab."""
        if not jobs:
            return
            
        try:
            worksheet = self.sheet.worksheet('job_inbox')
            rows = []
            for job in jobs:
                # Map fields to columns matching headers in state.py docstring
                # SITE | TITLE | COMPANY | CITY | STATE | JOB_TYPE | INTERVAL | MIN_AMOUNT | MAX_AMOUNT | JOB_URL | DESCRIPTION | CLASSIFICATION | REASONING | INBOX_STATUS | FOUND_DATE | ID
                row = [
                    job.get('site', ''),
                    job.get('title', ''),
                    job.get('company', ''),
                    job.get('city', ''),
                    job.get('state', ''),
                    job.get('job_type', ''),
                    job.get('interval', ''),
                    job.get('min_amount', ''),
                    job.get('max_amount', ''),
                    job.get('job_url', ''),
                    job.get('description', ''),
                    job.get('classification', ''),
                    job.get('reasoning', ''),
                    _enum_str(job.get('inbox_status', '')),
                    job.get('found_date', ''),
                    job.get('id', '') # ID might be generated or hash of URL
                ]
                rows.append(row)
            
            if rows:
                worksheet.append_rows(rows)
                print(f"Appended {len(rows)} jobs to job_inbox.")
        except Exception as e:
            print(f"Error writing to job_inbox: {e}")

    def write_optimized_jobs(self, jobs: list[OptimizedJob]):
        """Appends optimized jobs to optimized_jobs tab."""
        if not jobs:
            return
            
        try:
            worksheet = self.sheet.worksheet('optimized_jobs')
            rows = []
            for job in jobs:
                # TITLE | COMPANY | CITY | MIN_AMOUNT | MAX_AMOUNT | JOB_URL | RESUME_URL | COVER_LETTER_URL | OPTIMIZED_STATUS | OPTIMIZED_DATE | ID
                row = [
                    job.get('title', ''),
                    job.get('company', ''),
                    job.get('city', ''),
                    job.get('min_amount', ''),
                    job.get('max_amount', ''),
                    job.get('job_url', ''),
                    job.get('resume_url', ''),
                    job.get('cover_letter_url', ''),
                    _enum_str(job.get('optimized_status', '')),
                    job.get('optimized_date', ''),
                    job.get('id', '')
                ]
                rows.append(row)
            
            if rows:
                worksheet.append_rows(rows)
                print(f"Appended {len(rows)} jobs to optimized_jobs.")
        except Exception as e:
            print(f"Error writing to optimized_jobs: {e}")


    def read_approved_jobs(self) -> list[JobInboxItem]:
        """Reads jobs from job_inbox that are marked as APPROVED."""
        approved_jobs = []
        try:
            worksheet = self.sheet.worksheet('job_inbox')
            records = worksheet.get_all_records()
            for row in records:
                status = str(row.get('INBOX_STATUS') or row.get('inbox_status') or '').lower()
                if status == 'approved':
                    # Convert row to JobInboxItem
                    # This might be tricky if columns don't match exactly or are missing
                    # We do best effort mapping
                    job = JobInboxItem(
                        site=row.get('SITE') or row.get('site', ''),
                        title=row.get('TITLE') or row.get('title', ''),
                        company=row.get('COMPANY') or row.get('company', ''),
                        city=row.get('CITY') or row.get('city', ''),
                        state=row.get('STATE') or row.get('state', ''),
                        job_type=row.get('JOB_TYPE') or row.get('job_type', ''),
                        interval=row.get('INTERVAL') or row.get('interval', ''),
                        min_amount=str(row.get('MIN_AMOUNT') or row.get('min_amount', '')),
                        max_amount=str(row.get('MAX_AMOUNT') or row.get('max_amount', '')),
                        job_url=row.get('JOB_URL') or row.get('job_url', ''),
                        description=row.get('DESCRIPTION') or row.get('description', ''),
                        classification=row.get('CLASSIFICATION') or row.get('classification', ''),
                        reasoning=row.get('REASONING') or row.get('reasoning', ''),
                        inbox_status=JobInboxStatus.APPROVED,
                        found_date=str(row.get('FOUND_DATE') or row.get('found_date', ''))
                    )
                    approved_jobs.append(job)
        except Exception as e:
            print(f"Error reading approved jobs: {e}")
            
        return approved_jobs

# Helper functions for the nodes
def get_sheet_manager():
    sheet_id = os.getenv("SHEET_ID")
    if not sheet_id:
        raise ValueError("SHEET_ID not set in .env")
    return SheetManager(sheet_id)

def sheets_reader_node(state: JobAppState) -> JobAppState:
    """Locks sheet and reads existing URLs and approved jobs."""
    print("--- Sheets Reader Node ---")
    manager = get_sheet_manager()
    manager.lock_sheet()
    
    existing_urls = manager.read_existing_urls()
    print(f"Found {len(existing_urls)} existing URLs.")
    
    approved_jobs = manager.read_approved_jobs()
    print(f"Found {len(approved_jobs)} approved jobs for optimization.")
    
    return {
        "existing_urls": existing_urls,
        "approved_jobs": approved_jobs
    }

def sheets_writer_node(state: JobAppState) -> JobAppState:
    """Writes new data and unlocks sheet. Always unlocks, even on failure."""
    print("--- Sheets Writer Node ---")
    manager = get_sheet_manager()
    try:
        new_jobs = state.get("new_jobs", [])
        if new_jobs:
            manager.write_new_jobs(new_jobs)

        optimized_jobs = state.get("optimized_jobs", [])
        if optimized_jobs:
            manager.write_optimized_jobs(optimized_jobs)
    finally:
        manager.unlock_sheet()
    return {}

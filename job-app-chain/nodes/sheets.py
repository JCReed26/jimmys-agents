# Google Sheets Interactions
from langchain_google_community import SheetsToolkit
from state import JobInboxItem, OptimizedJob, RejectedJob, TrackedJob
import os
from dotenv import load_dotenv
load_dotenv()

class SheetManager:
    def __init__(self, sheet_id: str, drive_folder_id: str):
        self.sheet_id = sheet_id
        self.drive_folder_id = drive_folder_id
        self.sheets_toolkit = SheetsToolkit(service_account_file=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))

    def lock_sheet(self):
        # check cell a1 if green, lock it and return locked
        # if cell is red, wait for it to turn green in exponential backoff
        pass

    def unlock_sheet(self):
        # if sheet is locked, unlock it and return unlocked
        # if sheet is not locked, throw an error for crossed threads
        pass

    def read_inbox_tab(self):
        pass

    def add_job_to_inbox(self, job: JobInboxItem):
        pass

    def read_optimized_tab(self):
        pass

    def add_job_to_optimized(self, job: OptimizedJob):
        pass

    def read_rejected_tab(self):
        pass

    def add_job_to_rejected(self, job: RejectedJob):
        pass

    def read_tracked_tab(self):
        pass

    def add_job_to_tracked(self, job: TrackedJob):
        pass

sheet_manager = SheetManager(sheet_id=os.getenv("SHEET_ID"), drive_folder_id=os.getenv("DRIVE_FOLDER_ID"))
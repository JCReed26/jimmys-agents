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

def sheets_reader_node(state: JobAppState) -> JobAppState:
    """Reads the sheets systematically and returns the JobAppState"""
    # in parallel or batch read the job_inbox tab, optimized_jobs tab
    # finally reads the metadata tab to get other ids, get counts, etc. 
    # verify that data was pulled correctly by comparing counts to metadata
    # return the jobappstate with the new data
    pass

def sheets_writer_node(state: JobAppState) -> JobAppState:
    """Writes the sheets systematically and returns the JobAppState"""
    # in parallel or batch upsert the job_tracker tab, job_inbox tab, optimized_jobs tab, rejected tab
    # finally writes the metadata tab to get other ids, get counts, etc. 
    # verify that data was written correctly by comparing counts to metadata
    # return the jobappstate with the new data
    pass
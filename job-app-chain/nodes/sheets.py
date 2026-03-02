# Google Sheets Interactions

import os
from dotenv import load_dotenv
load_dotenv()

class SheetManager:
    def __init__(self, sheet_id: str, drive_folder_id: str):
        self.sheet_id = sheet_id
        self.drive_folder_id = drive_folder_id

    def lock_sheet(self):
        # check cell a1 if green, lock it and return locked
        # if cell is red, wait for it to turn green in exponential backoff
        pass

    def unlock_sheet(self):
        # if sheet is locked, unlock it and return unlocked
        # if sheet is not locked, throw an error for crossed threads
        pass

    def read_all_jobs(self, tab: str):
        # reads robs by tab to separate the data for each tab
        # returns a list of jobs for given tab argument
        pass

    def write_job_to_inbox(self, job: Job):
        # writes job to top of inbox tab table 
        # sends to start first hitl prompt to approve or reject job
        pass

    def move_row_to_optimization(self, row: int, from_tab: str, to_tab: str):
        pass

    def move_row_to_tracker(self, row: int, from_tab: str, to_tab: str):
        pass

    def move_row_to_rejected(self, row: int, from_tab: str, to_tab: str):
        pass

sheet_manager = SheetManager(sheet_id=os.getenv("SHEET_ID"), drive_folder_id=os.getenv("DRIVE_FOLDER_ID"))
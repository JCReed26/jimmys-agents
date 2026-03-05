# TODO: update this file to clean up the code and make it more readable and maintainable
# TODO: add tests and error handling, debug till passing tests
# TODO: add logging, tracking, and metrics tracking

# for jobspy scraper and playwright scraper
# this file also includes the logic to clean the data and add it to the state for classification
import csv
from pathlib import Path
from jobspy import scrape_jobs
from .classifier import classifier_agent
from state import JobDescription

JOB_CSV_PATH = Path('jobs.csv')
# JobSpy CSV Headers
# SITE | TITLE | COMPANY | CITY | STATE | JOB_TYPE | INTERVAL | MIN_AMOUNT | MAX_AMOUNT | JOB_URL | DESCRIPTION

class Scraper:
    def __init__(self):
        self.jobs = []
        self.rejected_jobs = []
        self.job_inbox = []

    def _make_google_search(self, search_term: str, location: str):
        return f"{search_term} jobs near {location}, since yesterday"

    def scrape_jobs(self, search_term: str, location: str, results_wanted: int, hours_old: int):
        """Scrapes jobs from jobspy and saves to csv file. Returns len of jobs scraped."""
        jobs = scrape_jobs(
            site_name=["indeed", "ziprecruiter", "glassdoor", "google"],
            search_term=search_term,
            google_search_term=_make_google_search(search_term, location),
            location=location,
            results_wanted=results_wanted,
            hours_old=hours_old,
            country_indeed='USA',

            
        )
        if JOB_CSV_PATH.exists():
            JOB_CSV_PATH.unlink()
        jobs.to_csv(JOB_CSV_PATH)

        return len(jobs)

    def clean_data(self):
        """ does multiple things to the jobs.csv
        1. Removes rejected jobs from the csv, puts in rejected list
        2. Takes approved jobs transforms them into JobApplications and puts in job_inbox list
        3. returns the lists for each of the above rejected, job_inbox
        """
        return self.rejected_jobs, self.job_inbox


    def _create_job_classification_prompt(self, job: JobDescription) -> str:
        return f"""
        Please classify the following job as approved(should apply) or rejected(should not apply).

        Job Description: {job.model_dump_json(indent=2)}

        Return the classification in the following format:
        {{
            "classification": "approved" | "rejected",
            "reasoning": "brief explanation for the classification"
        }}
        """

    def classify_jobs(self):
        """Sends each job in batches to the classifier agent to grade the job and classify it as approved or rejected
        
        Returns a list of dicts with the following keys: classification, reasoning
        
        These line up with the Jobs in the csv file."""

        classified_jobs = [] # list of dicts with the following keys: classification, reasoning

        with open(JOB_CSV_PATH, 'r') as file:
            reader = csv.DictReader(file)
            for row in reader: 
                job = JobDescription(
                    site=row['SITE'],
                    title=row['TITLE'],
                    company=row['COMPANY'],
                    city=row['CITY'],
                    state=row['STATE'],
                    job_type=row['JOB_TYPE'],
                    interval=row['INTERVAL'],
                    min_amount=row['MIN_AMOUNT'],
                    max_amount=row['MAX_AMOUNT'],
                    job_url=row['JOB_URL'],
                    description=row['DESCRIPTION'],
                )
                prompt = self._create_job_classification_prompt(job)
                response = classifier_agent.invoke(prompt)
                classified_jobs.append(response)


scraper = Scraper()
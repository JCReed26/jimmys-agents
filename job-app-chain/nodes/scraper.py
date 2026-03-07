# for jobspy scraper and playwright scraper
# this file also includes the logic to clean the data and add it to the state for classification
import csv
import os
from pathlib import Path
from jobspy import scrape_jobs
from state import JobDescription, JobAppState
JOB_CSV_PATH = Path(os.getenv("JOB_CSV_PATH", "/app/data/jobs.csv"))
try:
    JOB_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
except (PermissionError, OSError):
    pass
# JobSpy CSV Headers
# SITE | TITLE | COMPANY | CITY | STATE | JOB_TYPE | INTERVAL | MIN_AMOUNT | MAX_AMOUNT | JOB_URL | DESCRIPTION

class Scraper:
    def __init__(self):
        self.scraped_jobs: list[JobDescription] = []

    def _make_google_search(self, search_term: str, location: str):
        return f"{search_term} jobs near {location}, since yesterday"

    def scrape_jobs(self, search_term: str, location: str, results_wanted: int, hours_old: int):
        """Scrapes jobs from jobspy and saves to csv file. Returns len of jobs scraped."""
        print(f"Scraping jobs for {search_term} in {location}...")
        try:
            jobs = scrape_jobs(
                site_name=["indeed", "ziprecruiter", "glassdoor", "google"],
                search_term=search_term,
                google_search_term=self._make_google_search(search_term, location),
                location=location,
                results_wanted=results_wanted,
                hours_old=hours_old,
                country_indeed='USA',
            )
            if JOB_CSV_PATH.exists():
                JOB_CSV_PATH.unlink()
            jobs.to_csv(JOB_CSV_PATH)
            print(f"Scraped {len(jobs)} jobs.")
            return len(jobs)
        except Exception as e:
            print(f"Error scraping jobs: {e}")
            return 0

    def load_and_clean_data(self):
        """Loads jobs from CSV and converts them to JobDescription objects."""
        self.scraped_jobs = []
        if not JOB_CSV_PATH.exists():
            return []

        with open(JOB_CSV_PATH, 'r') as file:
            reader = csv.DictReader(file)
            for row in reader:
                # Basic cleaning and mapping to TypedDict
                job = JobDescription(
                    site=row.get('site', ''),
                    title=row.get('title', ''),
                    company=row.get('company', ''),
                    city=row.get('city', ''),
                    state=row.get('state', ''),
                    job_type=row.get('job_type', ''),
                    interval=row.get('interval', ''),
                    min_amount=row.get('min_amount', ''),
                    max_amount=row.get('max_amount', ''),
                    job_url=row.get('job_url', ''),
                    description=row.get('description', ''),
                )
                self.scraped_jobs.append(job)
        return self.scraped_jobs

def scraper_node(state: JobAppState) -> JobAppState:
    """Scrapes jobs from jobspy and saves to csv file. Returns state with scraped_jobs."""
    try:
        scraper = Scraper()

        search_term = state.get("search_term", "software engineer")
        location = state.get("location", "remote")
        results_wanted = state.get("results_wanted", 5)
        hours_old = state.get("hours_old", 24)

        scraper.scrape_jobs(search_term, location, results_wanted, hours_old)
        raw_jobs = scraper.load_and_clean_data()

        existing_urls = set(state.get("existing_urls", []))
        scraped_jobs = [job for job in raw_jobs if job.get("job_url") not in existing_urls]

        print(f"Filtered {len(raw_jobs) - len(scraped_jobs)} duplicate jobs.")
        return {"scraped_jobs": scraped_jobs}
    except Exception as e:
        print(f"Scraper node failed: {e}")
        return {"scraped_jobs": [], "error_message": f"scraper_node: {e}"}

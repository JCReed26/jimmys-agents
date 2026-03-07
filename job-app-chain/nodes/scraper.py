# for jobspy scraper and playwright scraper
# this file also includes the logic to clean the data and add it to the state for classification
from jobspy import scrape_jobs
from state import JobDescription, JobAppState
import pandas as pd

class Scraper:
    def __init__(self):
        self.scraped_jobs: list[JobDescription] = []

    def _make_google_search(self, search_term: str, location: str):
        return f"{search_term} jobs near {location}, since yesterday"

    def scrape_jobs(self, search_term: str, location: str, results_wanted: int, hours_old: int) -> pd.DataFrame:
        """Scrapes jobs from jobspy and returns a DataFrame."""
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
            print(f"Scraped {len(jobs)} jobs.")
            return jobs
        except Exception as e:
            print(f"Error scraping jobs: {e}")
            return pd.DataFrame()

    def clean_data(self, jobs_df: pd.DataFrame):
        """Converts DataFrame to JobDescription objects."""
        self.scraped_jobs = []
        if jobs_df.empty:
            return []

        # Convert DataFrame to list of dicts
        records = jobs_df.to_dict('records')

        for row in records:
            # Basic cleaning and mapping to TypedDict
            # Ensure all values are strings to match TypedDict definition
            job = JobDescription(
                site=str(row.get('site', '')),
                title=str(row.get('title', '')),
                company=str(row.get('company', '')),
                city=str(row.get('city', '')),
                state=str(row.get('state', '')),
                job_type=str(row.get('job_type', '')),
                interval=str(row.get('interval', '')),
                min_amount=str(row.get('min_amount', '')),
                max_amount=str(row.get('max_amount', '')),
                job_url=str(row.get('job_url', '')),
                description=str(row.get('description', '')),
            )
            self.scraped_jobs.append(job)
        return self.scraped_jobs

def scraper_node(state: JobAppState) -> JobAppState:
    """Scrapes jobs from jobspy and returns state with scraped_jobs."""
    try:
        scraper = Scraper()

        search_term = state.get("search_term", "software engineer")
        location = state.get("location", "remote")
        results_wanted = state.get("results_wanted", 5)
        hours_old = state.get("hours_old", 24)

        jobs_df = scraper.scrape_jobs(search_term, location, results_wanted, hours_old)
        raw_jobs = scraper.clean_data(jobs_df)

        existing_urls = set(state.get("existing_urls", []))
        scraped_jobs = [job for job in raw_jobs if job.get("job_url") not in existing_urls]

        print(f"Filtered {len(raw_jobs) - len(scraped_jobs)} duplicate jobs.")
        return {"scraped_jobs": scraped_jobs}
    except Exception as e:
        print(f"Scraper node failed: {e}")
        return {"scraped_jobs": [], "error_message": f"scraper_node: {e}"}

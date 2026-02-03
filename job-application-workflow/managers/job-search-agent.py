"""Scrapes job application sites for new jobs"""

JobTitles = [
    "Entry Level Software Engineer",
    "Junior Software Engineer",
    "Software Engineer",
    "Entry Level AI Engineer",
    "Junior AI Engineer",
    "AI Engineer",
    "AI Implementation Specialist",
    "Full Stack AI Engineer",
    "Junior Business Analyst",
    "Business Analyst",
    "Junior Solutions Engineer",
    "Solutions Engineer",
    "Entry Level Machine Learning Engineer"
]

JobLocations = [
    "Remote",
    "Remote in US",
    "Orlando, FL",
    "Miami, FL",
    "Tampa, FL",
    "Jacksonville, FL",
    "Tallahassee, FL",
    "Austin, TX",
    "San Antonio, TX",
    "Atlanta, GA",
    "New York, NY",
    "Los Angeles, CA",
    "San Francisco, CA",
    "Seattle, WA",
    "Chicago, IL",
    "Boston, MA",
    "Washington, DC",
    "Philadelphia, PA",
    "Phoenix, AZ",
    "San Diego, CA",
    "Dallas, TX",
    "Houston, TX",
    "Nashville, TN",
]

JobSites = [
    "LinkedIn",
    "ZipRecruiter",
    "Glassdoor",
    "Indeed",
]
import asyncio
from pyppeteer import launch, browser

async def get_pages():

    pages = []

    browser = await launch(headless=False)

    for site in JobSites:
        if site == "LinkedIn":
            page = await browser.newPage()
            await page.goto("https://www.linkedin.com/jobs/search/?f_E=2&geoId=90009590&keywords=software%20engineer&location=United%20States")
            pages.append(page)
        elif site == "ZipRecruiter":
            page = await browser.newPage()
            await page.goto("https://www.ziprecruiter.com/Search?q=software%20engineer&l=United%20States")
            pages.append(page)

    return pages


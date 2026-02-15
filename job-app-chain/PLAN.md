# PLAN

This is the job app chain

This chain represents a process that scrapes jobs and add them to a google sheet with the goal of automating the task of tracking my job applications.
The outcome shall increase my number of applications. Current Stats: ~5-10/week -> Outcome Stats: Unknown

## Modules

These make up the broken down steps in the chain

collect_jobs -> sort_jobs -> optimize_cv

## System

- This chain shall handle 100 jobs in under 2 minutes including AI Processing Time
- This chain shall manage async so jobs can be processed in an assembly line fashion
- This chain shall connect to google-sheets for the should_apply.csv which shall be checked and will move applied jobs to applied.csv if variable marked
- This chain shall handle linkedIn, Indeed, and Ziprecruiter through python-jobspy library
- This chain shall use a LangChain agent with GeminiAPI and google drive access to sort through the workflow
- This chain shall use a LangChain agent with GeminiAPI and google drive access to use a resume version and/or cover letter version to make minor modifications to optimize for the job being applied to

## Plan (by checkpoints)

1. JobSpy and ItemCleaning into raw_jobs.csv - test by getting clean jobs into csv and removing after completed

2. Create LangChain agent with access to a google drive folder with task to clear the queue of jobs needing to be sorted and sorting them into not_apply or should_apply attaching matching resume and or cover letter - test by checking jobs in raw_jobs are either in not_apply or should_apply with chosen documents 

3. Create LangChain agent with access to a google drive folder with task to optimize the chosen resume and or cover letter depending upon what was chosen by previous agent - test by checking for new file created for the specific to that job documents

4. Create the graph and test by clearing data, check every few seconds to watch and ensure jobs move from start to finish cleanly.

5. Create the agent to check the sheets should_apply inbox and move to applied_jobs or chose_not_apply_jobs then start the rest of the graph async flow.

6. Create cron job that runs workflow everyday at 6am. Deploy to homelab

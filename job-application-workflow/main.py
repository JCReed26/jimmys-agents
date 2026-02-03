# cron flow that runs every 1 hour 
# 
# first it checks the google sheets for jobs in inbox that have been marked applied and move to tracker 
# second it scrapes the job sites and formulates job objects adding them to list to be optimized 
# third it optimizes the resume and cover letter and saves to google docs
# fourth it adds the job to the google sheet in the inbox list for review 

# LangGraph Graph Flow

# Pre-req: verify google sheets is working and tables that store lists exist

# First Node: Agent Check Google Sheets for jobs in inbox that have been marked applied and move to tracker 

# Parallel with First Second Node: Agent Scrapes Job Sites and Formulates Job Objects add to scheduler for optimization

# Third Node: 2 Agents plan and in parallel Optimizes Resume and Cover Letter add to scheduler for review 

# Fourth Node: Agent Reviews Job Object and Optimized Resume and Cover Letter verifies accuracy and all information is present, fact checked, and added to the inbox list on the google sheet
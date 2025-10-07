# Dev Docs Summary

## context reports

takes in base url 

searches for the sitemap and gathers all urls into a list

sorts -> organizes by section

each section gets sent to research agents who generate a report for that sections pages 

the main report agent (has multiple research agents) == collects reports and generates 1 master report

the master report is then prompt optimized

return as markdown file (to use in mega chat)
# Tasks

## T-2 Import feeds
Depends on: T-3
Scope: fetch RSS and Atom feeds every 15 minutes, parse their items, write them through the feed store.

## T-3 Feed store
Depends on: —
Scope: the feeds and items tables, unique items by feed and guid.

## T-5 Report export
Depends on: T-3
Scope: the CSV export of the reading report.

## T-7 PDF reports
Depends on: T-5
Scope: the PDF export of the reading report, with charts.

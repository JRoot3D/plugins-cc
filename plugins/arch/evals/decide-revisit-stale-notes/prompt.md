---
description: A revisit from MongoDB to PostgreSQL must find the text the old choice left behind — the store's Notes and the search node's Connections line — and clean up only what the user approved.
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---
/arch:decide store — revisit: move to PostgreSQL with one schema per tenant, because reports need joins across tenants. Search will read row changes through logical replication. I approve every cleanup you propose; do not ask again.

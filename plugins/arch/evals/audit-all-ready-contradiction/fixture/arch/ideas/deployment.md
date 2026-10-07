# Idea: Deployment
_Created: 2026-09-20_
_Slug: deployment_

## Description
Where and how the backend runs.

## Decision
_Decided: 2026-10-01_

### What Was Decided
Run the whole backend on AWS Lambda behind API Gateway; no always-on servers.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| ECS Fargate | idle cost |

### Rationale
Lowest ops load for two people.

### Implications
background-jobs must fit Lambda's 15-minute limit and stateless model.

### Assumptions
| Assumption | Confidence | Basis |
|------------|------------|-------|
| Traffic is bursty | high | team benchmark 2026-09 |

### Confirmation
Monthly infra bill under $50 at launch.

## Priority
blocking

## Maturity
ready

## Notes


## Connections
- background-jobs — shared-concern: both define the runtime

## History
- 2026-09-20 /arch:new — Where and how the backend runs.

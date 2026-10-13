# Backend debugging exercise: IMS API

## Background

IMS is the small incident-management service our on-call engineers use to open, triage and close incidents.
Each team only sees its own incidents; platform admins see everything. It was written quickly by a few
people over time and has had no recent review. You have inherited it.

## Incident brief

Notes forwarded from Slack and the on-call channel. They are incomplete and some may be wrong.

- "After Friday's database failover the status page stayed green for a while, yet customers were getting errors."
- "Security asked whether a stolen refresh token would still be useful to someone after the real user rotated it."
- "A support engineer with a read-only account says they could open the ops summary report. Is that expected?"
- "We moved one engineer to another team and disabled a contractor on Monday. Some people think the contractor
  could still use the API on Tuesday."
- "Deploys sometimes drop requests. Also, `PORT` typos in staging have been weird."
- "Error responses look different depending on which endpoint I hit, and I can't always tie a client error to a log line."
- "Someone suspects last month's bcrypt upgrade made logins flaky." (Unconfirmed.)
- "A new hire with no team assigned yet seems to see more than they should."

You are not told where any of this lives, and not every note maps to a real problem.

## What we want from you

Investigate the service's **reliability and access-control behaviour**, using `docs/API.md` as the intended
contract. Get it running per `README.md`. The test suite and scripts will help, but they are not a complete
map: tests that fail may point at real problems, and tests that pass do not prove a behaviour is right.

### Priorities
First identify the most severe **security / data-isolation** and **availability** risks. Then choose a coherent
cluster of related failures to investigate in depth. State what you would **defer, and why**. You are not
expected to fix everything in a live session.

### Suggested timing (60-90 min live)
| Minutes | Focus |
|---|---|
| 0-10 | Orient, run it, list symptoms, pick priorities |
| 10-30 | Reproduce and investigate the highest-impact failures |
| 30-55 | Implement one or more fixes, add or adjust tests |
| 55-75 | Verify, look for adjacent risks |
| 75-90 | Explain findings, trade-offs and remaining work |

The optional take-home extension (2-3 hours) asks you to work through everything you can find.

### Deliverables
1. A ranked list of issues with impact/severity and evidence.
2. Reproduction steps for each issue you investigated.
3. Root cause and causal chain - keep facts and hypotheses separate.
4. Fixes, each with a regression test.
5. Commands/tests you ran and their **actual** outcomes (do not claim checks you did not run).
6. Remaining risks and suggested monitoring.
7. A short post-incident summary for the engineering team.
8. A note on any AI assistance you used and how you verified its suggestions.

### Ground rules
- Prefer small, targeted changes over rewrites. Do not weaken auth, loosen team boundaries, or disable tests
  to make something pass.
- Keep behaviour consistent with `docs/API.md`; if you believe the contract itself is wrong, say so.
- Everything runs locally against fictional data. Do not point this code at anything real.

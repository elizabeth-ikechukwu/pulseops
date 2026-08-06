# Postmortem template — what PulseOps generates automatically

This is the exact structure produced when a postmortem is generated for a
resolved incident. Fields shown as `[ ]` are pulled from the incident record
and status history automatically. Fields marked `(fill in)` are left for the
responding engineer to complete.

---

# Postmortem: INC-[number] — [incident title]

> Status: DRAFT · Severity: [P1/P2/P3] · Blameless: focus on systems and process, not people.

## Summary
(fill in)

## Impact
- **Severity:** [P1/P2/P3]
- **Detected:** [timestamp, from incident creation]
- **Acknowledged:** [timestamp] (TTA: [computed duration])
- **Resolved:** [timestamp] (TTR: [computed duration])
- **Customer impact:** (fill in)

## Timeline
| Time | Transition | By | Note |
|---|---|---|---|
| [timestamp] | [status] → [status] | [user] | [note from that transition] |

Rows are pulled directly from the incident's status history. Additional
detection, escalation, or mitigation events can be added manually.

## Root Cause
1. Why? (fill in)
2. Why? (fill in)
3. Why? (fill in)

## What Went Well
- (fill in)

## What Went Poorly
- (fill in)

## Action Items
| Action | Owner | Priority | Due | Ticket |
|---|---|---|---|---|
| (fill in) | | P1/P2/P3 | | |

## Lessons Learned
(fill in)

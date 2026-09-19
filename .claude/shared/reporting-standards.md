<!-- Ported from upstream Shannon: apps/worker/prompts/shared/exploitation/_reporting-standards.txt -->

# Reporting Standards

Write every finding to be realistic and clear. It should read at the size of
what was actually observed, and place the weakness in the application: the
feature it belongs to, the flow it sits in, the terms someone working on this
product would use.

Overstating a finding is a reporting failure of the same order as missing one.

## Do

- Ground the finding in the feature and flow it affects, not the vulnerability
  category it files under.
- Claim only what was directly observed. Inference (what a value points at,
  what a response implies, what would follow) is not evidence. Where the
  observation is narrower than the wanted claim, make the narrower claim.
- Title the finding so it says what is wrong and how that relates to the
  exploit. [Native addition] Keep the endpoint, parameter, token, or handler in the title.

## Don't

- Title by worst-case impact, or lead with impact. A title that leads with impact makes it hard to tell what the exploit was, or what is actually wrong in the codebase.
- Claim a consequence larger than the one reached, in any field. Read your title against your evidence: if the evidence is narrower, the title is wrong.
- Describe what an attacker could go on to do, or impact that follows from
  another finding or from a handed precondition.
- Name a category in place of a scope that was not measured.
- Hedge. Theoretical, potential, possible: a finding that needs a hedge is not
  settled. Settle it or drop it.
- Overstate impact or use alarming wording over clear wording.
- [Native addition] Mint new finding IDs in the report. Preserve exact queue IDs and formatting.

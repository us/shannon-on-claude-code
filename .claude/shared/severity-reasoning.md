<!-- Ported from upstream Shannon: apps/worker/prompts/shared/exploitation/_severity-reasoning.txt -->
<!-- Adapted for Claude Code native: TARGET_URL / deliverables paths, no Temporal/MCP tool calls. -->

# Severity Reasoning

Severity is a judgement about consequence. It is not a restatement of what was
achieved technically, and it does not follow from the proof level reached. Two
findings proven equally well can differ by three tiers.

Work through four questions before choosing a tier, and record the answers in
the finding's rationale field.

## 1. What does the attacker end up holding?

Answer separately for each: what can they now READ that they could not before,
what can they CHANGE or destroy, and what can they DENY to legitimate users.
Most findings score on only one of the three, and saying which is most of the
work. Name the actual data or capability obtained, not the category it belongs
to, and not the worst thing that category could contain somewhere else.

## 2. What did it take?

Every precondition lowers severity. Account for the privilege needed (none, an
ordinary account, or an administrator), whether a victim had to do something,
any timing or configuration condition, and anything relied on but not
demonstrated. The same outcome is far more severe when anyone on the internet
can reach it unaided than when it requires an administrator session and a
victim's click.

## 3. How far does it reach?

Does the consequence stay inside the attacked component, or spread to other
users, other systems, or other data? Propagation counts only if demonstrated.
"This would be serious combined with X" is not a consequence of this finding.
If the chain was not completed, the claimable impact ends where the testing
actually stopped.

## 4. What is it worth here?

Judge the consequence against what this application actually is and what it
exists to protect, established from the pre-recon and recon deliverables, not
against a generic table for the vulnerability class.

## The floor: not every finding has a tier

Answer question 1 before looking at the tiers, and take the answer literally.
If nobody ends up holding anything they should not (data reached only the
party already entitled to it, effect landed only on the attacker's own session
or record, no party is worse off), the finding has no consequence to rate.
Low is for a genuine defect with small consequence, not for no consequence.

Two checks catch dishonest tiering:

- The rationale must not refute the finding. If it contains the reason the
  attack does not matter, that is the argument for closing the finding.
- The criterion met must be the one assigned. Substituting a weaker criterion
  mid-run does not support any tier.

A finding that hits the floor is not recorded as a vulnerability. Note it in
the analysis deliverable with what was produced and why it carries no
consequence, and move on. Reporting nothing is a correct outcome.

## Choosing the tier

- **Critical**: severe, immediate and broad harm. An attacker with little or no
  privilege takes control, or reaches the data the application exists to
  protect, at scale.
- **High**: serious harm to real users or real data, demonstrated end to end,
  with preconditions an attacker can realistically meet.
- **Medium**: real harm, but bounded in scope, gated behind non-trivial
  privilege or conditions, or affecting data of limited value here.
- **Low**: a genuine defect whose realistic consequence is small, or whose
  exploitation demands so much it is unlikely worth an attacker's effort.

The burden of proof rises with the tier. Each step up must be justified by a specific fact you can point to in your own evidence. If you cannot name that fact, the finding belongs one tier lower. Where two tiers both seem arguable, choose the lower one: a report in which everything is urgent tells the reader nothing about what to fix first.

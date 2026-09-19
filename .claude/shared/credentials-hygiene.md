<!-- Shared credential-hygiene rule for all Shannon native agents.
     Covers both exploitation evidence and analysis queues/reports. -->

# Credential Hygiene

The credentials this engagement authenticates with, the username, the password,
and the TOTP secret, must never appear literally in any deliverable. That
covers every field: titles, locations, overviews, queue entries, exploitation
steps, proof of impact, evidence blocks, and notes. It covers them wherever
they appear: inside a quoted command, inside a captured request or response
(including reflections and error messages the target echoes back: redact the
credential value even when quoting target output), inside a payload, or in
ordinary prose.

**Write the placeholder instead.** Use `$username`, `$password`, and `$totp`
in place of the values themselves. This is a substitution, not an omission:
the step stays complete and reproducible, and the reader supplies the
credentials from the engagement's own configuration.

- Write `log in as $username with $password`, never the literal values.
- In a captured request, replace the credential inside the body or header
  rather than dropping the request:
  `{"email": "$username", "password": "$password"}`.

Treat `$username`, `$password`, and `$totp` as the literal text to type. They
are placeholders in what is submitted, and nothing expands them afterwards.

**A generated six-digit TOTP code is not a secret** and may be recorded as-is.
It expires within the minute. Only the secret it was generated from is covered
by this rule.

Anything discovered during testing that is genuinely part of the finding, a
session token captured, a key extracted, data exfiltrated, is evidence and
belongs in the submission. This rule is about the credentials configured for
the engagement, not about what was obtained. Secrets discovered in code
(hardcoded keys, tokens) are finding leads: record the file:line location,
never paste the secret value itself into any deliverable.

# Safety and Limitations

## Authorized use only

Shannon executes real exploits. Run only against applications and environments
you own or have explicit written authorization to test. Never point Shannon at
third-party systems. Misuse is illegal.

## Never production

Exploitation mutates state: creates users, submits forms, modifies or deletes
data, triggers outbound requests. Use sandboxed, staging, or local development
environments with disposable data. Analysis-only mode (`exploit: "false"` or
the pre-flight choice) sends no payloads and is the only mode near production,
and even then prefer staging.

Additional rules:

- Never run as root (`id -u` must not be 0); the orchestrator refuses otherwise.
- Do not scan untrusted or adversarial codebases: agents read source code and
  can be exposed to prompt injection.
- Respect `rules_of_engagement` and typed avoid rules; they are rendered into
  every agent but are not a sandbox. You remain responsible.

## Limitations

- Coverage is six classes: injection, XSS, authentication, authorization,
  SSRF, miscellaneous. Dependency, secrets, configuration, and broad
  static-analysis findings are out of scope (see coverage-roadmap.md).
- Proof-by-exploitation still needs human review: LLM reports can contain
  weakly supported details. Only demonstrated findings ship in exploit mode.
- A full run takes on the order of an hour and consumes significant model
  context; SAST-lite runs white-box only to bound cost.
- No crash recovery beyond resume-from-deliverables; no retry policies. A
  killed run resumes via re-invocation, it does not self-heal.

# v2 roadmap

Ordered by what most reduces the riskiest assumptions first. Independent concept; nothing here is a commitment by anyone.

## Now → next (validate)

1. **Discovery round.** 10 release-manager interviews and 6 moderated tests on this prototype. Exit: success criteria in [METRICS.md](METRICS.md).
2. **Configurable rules.** Coverage threshold, which permissions are blockers, minimum reason length, required ticket link for certain risks.
3. **Reason quality.** Require a reason to reference evidence (a test id, ticket or record count) for destructive sign-offs.

## Next (make it real, still read-only)

4. **Derived dependencies.** Read metadata relationships from an existing comparison result instead of declared `dependsOn`, including Agentforce planner → topic → action → Apex/prompt chains.
5. **Real inventory.** Use the target org's metadata list from an existing comparison as the inventory.
6. **Test evidence ingestion.** Import Apex test results and agent conversation test results in their native formats.
7. **Multi-reviewer sign-off.** Verified identities, required roles for certain findings (security owner for Modify All, data owner for destructive changes).

## Later (close the loop)

8. **Outcome joining.** Link promoted slices to rollbacks and hotfixes to compute the north-star metric and tune rules.
9. **Pipeline gate.** Expose the decision as a status check, with the memo attached to the change record.
10. **Runtime hints.** Flag dynamic references (string-built SOQL, dynamic field access) as "dependency unknown" instead of silently passing.

## Explicitly not planned

- Generating fixes automatically.
- Executing deployments from the desk.

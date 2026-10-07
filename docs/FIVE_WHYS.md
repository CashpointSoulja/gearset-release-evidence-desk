# Five Whys: "It passed the demo, then failed at release"

A hypothesis chain to test in discovery, not a diagnosis of any company's systems.

**Problem statement:** An AI-assisted Agentforce change works in the developer's sandbox demo but fails, or behaves unsafely, after promotion.

1. **Why did it fail at release?** The agent action called an Apex class that was not in the package and not in the target org, and the prompt template referenced a field that did not exist there.
2. **Why was it not in the package?** The author selected the components they had touched. The Apex class was generated in the same session and lived only in the sandbox, so it never felt like "part of the change".
3. **Why didn't the demo reveal it?** The demo ran in the sandbox where every component already existed, as an admin user, through one happy-path conversation. Nothing exercised the target org's inventory, a restricted user or a refusal.
4. **Why wasn't that caught in review?** Review looked at the diff of the components in the package. A missing component is not in the diff, and permission sets read as boilerplate. Tests were present, which looked like evidence of completeness.
5. **Why does review focus on what is present rather than what is required?** The review artefact is a list of changes. There is no shared view that joins the change list, the dependency graph, the target inventory, the permission delta and the test scenarios, and no rule that says what "complete" means for an AI-assisted slice.

**Root cause (hypothesis):** release review lacks a joined, rule-based definition of "complete and safe" for a slice, so plausible-looking AI output is judged by its demo.

**Countermeasures in this prototype**

| Why | Countermeasure |
|---|---|
| 1–2 | Missing-dependency check against slice plus target inventory, non-overridable |
| 3 | Test matrix by scenario; AI-assisted changes need negative or permission evidence |
| 4 | Permission widening listed with who receives it; Modify All is a blocker |
| 5 | One desk joining diff, graph, inventory, permissions and tests; decision memo with explicit gates |

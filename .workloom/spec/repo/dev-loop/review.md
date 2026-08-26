# pro review

The pro subagent reviews every change and outputs an issue list.

- rule: each issue carries `file:line`, a problem description, and a fix suggestion
- rule: review covers three axes — spec conformance, correctness, style compliance
- rule: no praise-only reports; the final line states "conclusion: pass / needs fixes" with one reason
- counter-example: a review that says "looks good" without checking the behavior spec

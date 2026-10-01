# CareFlow Autonomous Continuation Directive

## Mandatory instruction

When working on the Hospital AI Assistant / CareFlow project, do not stop after merely reporting what was completed.

At the start of every subsequent work turn:
1. Read this file first.
2. Read public/HMIS_CAREFLOW_PLAN.md.
3. Identify the first unfinished workflow or earliest concrete remaining item.
4. Immediately implement the next safe concrete piece.
5. Test it with available automated tools.
6. Update the plan and relevant test-case document.
7. Dry-run and deploy when ready.
8. Verify the deployed route/build where possible.
9. Do not wait for the user to say "continue" when an obvious next implementation step exists.
10. Never mark a workflow Complete unless its completion gate has actually passed.
11. If authenticated staff E2E is blocked by the available session/tool, continue all other safe implementation and automated testing and record the remaining gate.
12. Never expose API keys, passwords, session cookies, or other secrets.

## End-of-work checklist

Before sending a progress response:
- Re-read this file.
- Re-read the relevant plan section.
- Determine the next concrete implementation task.
- If another safe implementation step is available, perform it before responding.
- Update plan/test cases with actual work performed.
- Report deployment version and remaining gates accurately.

## Workflow order

Use public/HMIS_CAREFLOW_PLAN.md as the source of truth. Prefer the earliest unfinished workflow and then its earliest concrete remaining item.

This is a project-level continuation reminder. It does not itself create a scheduled task or execute code after a chat response.
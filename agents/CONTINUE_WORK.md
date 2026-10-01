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

## Current continuation target

Theatre / procedures is intentionally parked by user request. The active workflow is now **Inventory / Assets**. The next-task loop is mandatory:
1. At the beginning of EVERY work turn, re-read this file and public/HMIS_CAREFLOW_PLAN.md.
2. Before changing any workflow, inspect the relevant hmislk/hmis repository code/design on the development branch and use it as the domain, workflow, UI and data-model reference. Do not invent HMIS-like behavior without checking the repository.
3. Execute the FIRST unfinished task listed below immediately. Do not stop at a status report when a safe implementation/test task remains.
4. After each task: test → update this file with the next concrete task → update the HMIS plan/test cases → dry-run → deploy → verify.
5. If authenticated staff E2E is unavailable, leave that gate open but continue the next safe automated/invariant/API work; never claim E2E completion.
6. Before any new workflow is started, verify its required CareFlow schema exists in the external PostgreSQL adapter database.

### NEXT TASK QUEUE — always keep this current
1. Inventory / Assets: authenticated staff E2E for asset create/search/transfer, plus concurrent transfer and role-boundary execution tests. **Blocked only by the missing hospital staff session; do not claim completion.**
1a. Inventory / Assets schema gate is satisfied; production invariant validator is now live and currently returns 0 violations.
2. Inventory / Assets safety: continue non-session-safe coverage for inactive-asset protection, hospital isolation, concurrent transfer invariants and transfer-history integrity. Current invariant validator covers lifecycle, financial, custodian, orphan/cross-hospital and latest-transfer continuity; authenticated execution remains open.
3. Inventory / Assets HMIS gap review: warranty/AMC expiry, transfer and depreciation/register reporting are implemented through v331. Pharmacy/store stock-history and the external `pharmacy_stock` + `pharmacy_stock_transactions` schema are verified. v336 adds HMIS-aligned bin-card/stock-balance presentation, quantity_before/quantity_after ledger snapshots, and an 8-check production stock-ledger validator with 0 violations. v338 adds HMIS-aligned closing-stock reporting with as-of date, medicine/batch filters, optional inactive stock, and explicit balance provenance. Inventory report-family review is now complete for the currently modeled CareFlow stock data; the remaining concrete Inventory gate is authenticated stock receipt/dispensing E2E. When staff session remains unavailable, move to the next workflow preparation rather than claiming E2E completion.
4. Next workflow: Staff / Roles / Permissions / Hospital Configuration. HMIS references inspected: `Privileges.java` and `UserPrivilageController.java`, showing module-level privileges plus user/role privilege assignment scoped by department. Before implementation, verify CareFlow staff/permission schema in the external PostgreSQL database and map these concepts to the existing server-side permission layer.
5. Then Integrations/REST/FHIR/LIS → Reporting/Analytics, always using the HMIS repository as the design/code reference.

### Current Theatre status
- Production validator: 22/22 passed, 0 violations.
- Anonymous Theatre access: 401.
- Authenticated hospital-staff E2E: still open because the available execution environment has not established a real staff session.
- Theatre remains In progress until the authenticated completion gate passes.

### HMIS reference rule
For every Theatre increment, inspect at minimum the relevant HMIS surgery/theatre/inpatient pages/controllers/services and persistence model; current references include surgery_add.xhtml, surgery_edit.xhtml, SurgeryBillController, surgery_clinical_details.xhtml, patient_surgery.xhtml, and the inpatient Theatre workflow. For future domains, replace these with that domain's actual HMIS repository code before implementation.

This file is the persistent next-task/reminder loop. It must never be left with an empty or stale NEXT TASK QUEUE.
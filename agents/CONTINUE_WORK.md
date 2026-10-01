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

Theatre / procedures is now the active UI workstream. **The active implementation focus is the CareFlow UI redesign.** `public/HMIS_CAREFLOW_UI_PLAN.md` is the UI source of truth and `agents/CONTINUE_WORK.md` is the persistent live task/reminder queue. Backend completion gates remain preserved and must not be weakened. The next-task loop is mandatory:
1. At the beginning of EVERY work turn, re-read this file and public/HMIS_CAREFLOW_PLAN.md.
2. Before changing any workflow, inspect the relevant hmislk/hmis repository code/design on the development branch and use it as the domain, workflow, UI and data-model reference. Do not invent HMIS-like behavior without checking the repository.
3. Execute the FIRST unfinished task listed below immediately. Do not stop at a status report when a safe implementation/test task remains.
4. After each task: test → update this file with the next concrete task → update the HMIS plan/test cases → dry-run → deploy → verify.
5. If authenticated staff E2E is unavailable, leave that gate open but continue the next safe automated/invariant/API work; never claim E2E completion.
6. Before any new workflow is started, verify its required CareFlow schema exists in the external PostgreSQL adapter database.

### MASTER E2E LOOP QUEUE — added 2026-10-02
Run this queue top-to-bottom. A checkbox is marked complete only after the deployed behavior has actually been exercised and the expected result observed. Demo-mode execution counts as application E2E for workflow/permission behavior, but is explicitly labeled demo E2E and does not replace the real OTP/staff-production gate.

1. [ ] E2E-AUTH — verify CARE_FLOW_DEMO_MODE=true harness; verify all 8 roles (admin, receptionist, nurse, doctor, lab, pharmacy, billing, store); verify role selection; verify false/unset restores OTP; verify demo identity never becomes a real staff account.
2. [ ] E2E-RECEPTION — Receptionist: Hospital Home → Patient Workspace → search/select existing patient → register new patient → duplicate protection → UHID/source → appointment → check-in → token → queue; verify restricted actions return expected denial.
3. [ ] E2E-QUEUE — queue ordering/priority → call-next → concurrent call-next → valid forward transitions → invalid transition 409 → terminal completion → patient context continuity.
4. [ ] E2E-NURSING — Nurse: patient workspace → vitals → triage → red flags → nursing handoff → queue progression; validate invalid vitals and role boundaries.
5. [ ] E2E-DOCTOR — Doctor: queue patient → Doctor Room → encounter continuity → history/vitals → consultation → clinical note → prescription → lab order → follow-up → completion; verify consultation/queue/encounter closure and doctor assignment boundary. Diagnosis remains open unless a verified mutation contract exists.
6. [ ] E2E-LAB — Lab: worklist → sample collection → processing → result entry → verification → report → doctor notification; validate invalid transitions, duplicate/retry behavior and hospital isolation.
7. [ ] E2E-PHARMACY — Pharmacy: prescription → stock/batch selection → FEFO dispense → multi-batch → ledger → queue completion → duplicate/concurrent retry protection → insufficient/expired stock → transfer issue/receive/cancel → receipt idempotency → event-failure boundary.
8. [ ] E2E-BILLING — Billing: invoice read/create contract → charge grouping → payment → partial/full status → overrun/duplicate/retry → PDF → financial audit; preserve 13 legacy ledger gaps and never synthesize payment history.
9. [ ] E2E-IPD — admission → bed allocation → occupied-bed rejection → transfer atomicity → discharge checklist → discharge → bed release → re-admission → encounter continuity; include terminal checklist mutation protection.
10. [ ] E2E-THEATRE — only when requested/needed: procedure → room conflict → team → lifecycle → validation/revert → charges → ward return; preserve authenticated Theatre gate.
11. [ ] E2E-INVENTORY — assets/search/detail/transfer/history → no-op/duplicate protection → pharmacy issue/receive/cancel → stock/transfer concurrency and role boundaries.
12. [ ] E2E-STAFF — admin staff lifecycle → departments → roles → role permissions → global/department overrides → effective permissions → audit → hospital configuration/validation.
13. [ ] E2E-INTEGRATIONS — capability discovery → integration settings/key boundary → FHIR auth/isolation → LIS verified sample contract → idempotency → HL7/ASTM boundary; never enable unverified clinical result writes.
14. [ ] E2E-REPORTING — reporting/analytics scope, role authorization, filters, cross-module continuity and restricted-data checks.
15. [ ] E2E-CROSSCUT — for every role: navigation, Patient Workspace, direct API access, invalid IDs/transitions, duplicate/retry/concurrency, audit/event continuity, mobile behavior and cross-hospital isolation.
16. [ ] E2E-RELEASE — unexpected 5xx review, protected-route 401/403 review, financial/clinical data-integrity review, final browser E2E, physical-device mobile verification and deployment verification.
Safety gates that remain explicitly open until their evidence exists: genuine hospital-staff OTP E2E, Billing legacy reconciliation, LIS authenticated write path, and physical-device mobile verification.

### NEXT TASK QUEUE — always keep this current
UI workstream is now the active implementation focus requested by the user. Execute UI-00 then UI-01 onward from public/HMIS_CAREFLOW_UI_PLAN.md, while preserving the backend safety gates below.
UI-00 current: module launcher/navigation regrouping and the global patient-context foundation are deployed; shared legacy-control cleanup is complete, with module-specific cleanup continuing inside each module.
UI-01 current: selected-patient identity/context bar and Actions vs Reports/History separation are implemented and deployed in v399. UI-02 current: HMIS-aligned appointment worklist is deployed in v401 with date-grouped day view, doctor/session/status/date/search filters, patient context, booking, check-in/token, confirmation, cancellation and no-show actions. UI-03 current: HMIS OPD Token/Queue patterns are deployed in v402 with stage columns, priority ordering/visibility, atomic call-next, token display entry, reception kiosk, constrained manual transitions, persistent patient workspace context and hospital-home navigation. UI-04 current: HMIS Nursing Workbench patterns are deployed in v403 with role-aware nursing worklist messaging, Patient Workspace nurse actions, vitals, triage, required nursing handoff and visible red-flag context. UI-05 current: HMIS EMR OPD-visit patterns are deployed in v404; Doctor Room now has patient/UHID/token search while preserving consultation/history/vitals/orders/prescription/follow-up/completion transitions. Diagnosis remains intentionally open because no verified CareFlow diagnosis mutation contract exists. UI-06 current: HMIS lab worklist/result-verification patterns are deployed in v405 with searchable/status-filtered lab worklist, visible state progression, patient-context results and verification actions. UI-07 current: HMIS pharmacy patterns are deployed in v406 with pharmacy workbench, dispensing queue search/status filters, prescription/patient context, stock/low/expiry visibility, stock history, bin card, closing stock and existing transfer-state workflows. UI-08 current: HMIS Admission Profile/inpatient patterns are deployed in v407 with admission search/worklist, admission/BHT context, persistent Patient Workspace hub, room/bed actions, transfer/discharge paths, and separate clinical/financial history. UI-09 current: billing worklist/search/filter and patient financial context are deployed; v409 added read-only invoice charge grouping, payment history and incremental payment-entry presentation using the existing billing contract, v410 added the protected invoice Print/PDF action, v413 added the Insurance/TPA claims worklist, and v415 added protected read-only financial audit/history from invoice detail. Anonymous billing/audit access is 401 and the available signed-in app-user harness is rejected by requireStaff(), so no hospital-staff E2E is claimed. The invoice editor remains blocked until a verified server-side invoice-edit mutation contract exists. UI-10 Theatre full UI loop is implemented and closed for the available non-session-safe/UI coverage in v422; authenticated hospital-staff Theatre E2E remains open. **UI-11 Inventory / Assets one-pass UI increment is implemented and published in v424. Its only remaining gate is authenticated hospital-staff E2E. Because the runner still has no genuine staff session, the next safe implementation target is UI-12 Staff / Roles / Hospital Setup while keeping the U11 E2E gate open.** It covers the HMIS-aligned asset worklist/detail/history/reporting, inventory summary, pharmacy/store stock catalogue, and pharmacy transfer issue/receive/cancel workbench. A real backend defect was also corrected: transfer issue now creates a new transfer without requiring transfer_id; receive/cancel still require it.

LOOP STATE (mandatory): After each UI increment, mark only verified checklist items complete in public/HMIS_CAREFLOW_UI_PLAN.md, set the FIRST unfinished UI item here, then dry-run/deploy/verify before moving to the next item. Never leave NEXT TASK QUEUE stale or empty.
### UI-11 LOOP QUEUE — one-pass implementation completed in the draft; verify/deploy before closing each item
1. [x] HMIS gap review — inspected HMIS Store inventory/asset registry, fixed-asset reports, stock history/bin-card and pharmacy transfer/receive references.
2. [x] Inventory worklist — asset search/filter by code, description, serial, category, location/custodian and lifecycle status.
3. [x] Asset detail/history — existing protected asset detail and transfer history are presented as an operational record, not a patient event.
4. [x] Inventory catalogue — category filter plus existing pharmacy/store stock catalogue; no duplicate stock master introduced.
5. [x] Stock movement visibility — existing stock history/bin-card/closing-stock reports remain linked from the inventory workbench.
6. [x] Fixed-asset transfer — existing atomic transfer contract exposed with location/custodian continuity.
7. [x] Pharmacy transfer issue — existing issue contract surfaced; corrected the route contract so issue creates the transfer without requiring transfer_id.
8. [x] Pharmacy transfer receive/cancel — existing in_transit terminal transitions surfaced with refresh of stock and transfer history.
9. [x] Assignment/location/maintenance context — current custodian, location, lifecycle, warranty and AMC surfaced without inventing unsupported mutations.
10. [x] Validation/audit boundary — existing server validators and transfer ledger/history remain authoritative; UI does not replace them.
11. [x] Operational dashboard — asset counts/value/maintenance/expiry watch plus stock and transfer worklists are visible.
12. [x] Role/authorization UX — existing asset/pharmacy permissions and department ownership remain server-authoritative.
13. [x] Responsive/mobile inventory — compact search/filter/action controls follow existing responsive worklist patterns.
14. [x] Dry-run/deploy/access verification — final U11 publish is v424; dry-run returned 0 errors; anonymous /api/fixed-assets and /api/pharmacy-stock-transfers returned 401; unsigned app-user execution also returned 401; fixed-asset validator returned 0 violations and pharmacy-stock validator returned 11/11 checks with 0 violations.
15. [ ] Authenticated hospital-staff E2E — asset create/search/transfer and pharmacy issue/receive/cancel, role boundaries and concurrency remain the final UI-11 gate; the available runner still has no genuine hospital staff session.

Inventory backend safety was already verified before this UI pass: fixed-asset validator 0 violations; pharmacy transfer validator 11/11 checks with 0 violations.
4. Staff / Roles / Permissions / Hospital Configuration: the verified backend foundation and an earlier basic admin UI already exist. U12 is now the active UI redesign workstream. HMIS references: `Privileges.java`, `UserPrivilageController.java`, `ConfigOption.java`, `ConfigOptionController.java`, `AuditEventController.java`, and `all_audit_events.xhtml`. v346 staff validation returned 0 violations across 7 checks. v350 added the owner-only `/api/hospital-config-validation`; it has been executed successfully with **7/7 checks and 0 violations**, while anonymous access returns 401. v357 adds HMIS-aligned staff lifecycle/permission audit writes and protected administrator-only `/api/staff-audit`; external `audit_logs` was verified in `medsystem`. **U12 queue:** U12-01 through U12-23 in `public/HMIS_CAREFLOW_UI_PLAN.md), with U12-23 authenticated administrator/staff E2E intentionally deferred for later.
5. Integrations/REST/FHIR/LIS is active. HMIS REST API and LIMS middleware references were reviewed. v361-v369 establishes the shared hashed integration-key model and documents the HMIS-compatible LIS result contract, but the new public LIS route repeatedly hit a database-adapter 500 in the available execution harness before its intended auth guard, so the unverified LIS route was removed rather than shipped with a known 500. NEXT: authenticated integration E2E and a safe reimplementation of the LIS JSON boundary using the verified session/adapter path, then HL7/ASTM adapter boundaries before Reporting/Analytics. v371 adds the non-secret `/api/integration-capabilities` discovery document; capability documentation gate is now implemented. Staff authenticated E2E remains open and must never be claimed.

### Current Theatre status
- Production validator: 22/22 passed, 0 violations.
- UI-10 procedure worklist: deployed in v417 with HMIS-aligned search, status/date filters, patient/UHID/admission context and existing lifecycle actions.
- **UI-10 LOOP QUEUE — process strictly in order; after completing one item, update this file and continue with the next unfinished item:**
  1. [x] Procedure worklist — deployed v417.
  2. [x] Room schedule — implemented using existing hospital-scoped Theatre rooms and scheduled/in-progress procedures.
  3. [x] Patient/procedure header — selected procedure context includes patient, UHID/BHT, admission, procedure, doctor, room and lifecycle state.
  4. [x] Surgical team — existing team assignments are presented and verified team_add/team_remove contracts are exposed.
  5. [x] Lifecycle controls — only existing protected Theatre transitions are exposed; completion requires outcome.
  6. [x] Theatre charges — protected charge presentation and existing billing/admin charge creation are surfaced.
  7. [x] Ward return — existing protected completed-procedure ward_return transition is surfaced with admission context.
  8. [x] Validation/revert — existing protected validation and validation-revert contracts are surfaced with required revert reason.
  9. [x] Clinical/financial closure presentation — completion, outcome, charges, validation and ward-return state are combined in one procedure view.
  10. [x] UI-10 closure pass — all listed Theatre UI increments are implemented without inventing backend transitions; authenticated hospital-staff E2E remains the Theatre execution gate.
- **LOOP RULE:** For every item: inspect relevant HMIS surgery/theatre/inpatient reference; inspect current CareFlow contract; implement the smallest safe UI increment; dry-run; deploy; perform access-boundary checks where possible; update the UI plan and test cases; mark only verified items complete; then set the next unfinished item here. Never leave the queue stale or empty.
- Authenticated hospital-staff E2E remains open because the available execution environment has not established a real staff session.

### UI-12 LOOP QUEUE — execute in order; authenticated E2E is deliberately last/deferred
1. [x] U12-01 Staff directory worklist — implemented in v427 with search, role/department/status filters, counts and empty state.
2. [x] U12-02 Staff identity/detail — implemented in v427 with selected-record identity, role, department, doctor link, account/hospital context and permission handoff.
3. [x] U12-03 Staff lifecycle controls — v428: selected-record role/department/doctor-link/active controls, confirmation and administrator-only audit history.
4. [x] U12-04 Staff registration flow — v428: display name, supported role, optional department/doctor link, pending/active choice and server duplicate-safe feedback.
5. [x] U12-05 Department context — v428: hospital-scoped department cards with staff/active counts and directory filtering.
6. [x] U12-06 Role catalogue — v428: supported CareFlow roles with staff and enabled-permission counts.
7. [x] U12-07 Role permission matrix — v430 draft: searchable/grouped role baseline matrix using existing permission catalogue and role_permissions contract.
8. [x] U12-08 User permission overrides — v430 draft: explicit global/department scope using existing user_permissions contract.
9. [x] U12-09 Inherit / Allow / Deny UX — v430 draft: Inherit deletes the stored override; Allow/Deny persist boolean values.
10. [x] U12-10 Effective permission view — v430 draft: selected staff effective state shows role baseline, global override and department override source using verified server precedence.
11. [x] U12-11 Permission safety/authorization feedback — v430 draft: admin-only controls, server-authoritative errors and clear scope/precedence messaging.
12. [x] U12-12 Staff audit/history — v431.
13. [x] U12-13 Staff availability — v431.
14. [x] U12-14 Hospital profile/configuration — v431.
15. [x] U12-15 Hospital modules/features/settings — v431.
16. [x] U12-16 Department configuration — v431.
17. [x] U12-17 Services/working hours/labels — v431.
18. [x] U12-18 Configuration validation — v431, 7/7 checks and 0 violations.
19. [x] U12-19 Responsive/mobile administration — v431.
20. [x] U12-20 HMIS comparison pass — v431.
21. [x] U12-21 Documentation/test pass — refreshed v463 against the current deployed state; U12 UI/test/continuation documentation is synchronized and explicitly separates role-preview from genuine staff E2E.
22. [x] U12-22 Automated access/contract verification — v435: 14 staff/permission/hospital configuration invariants all returned 0 violations; protected-route access evidence remains 401 for anonymous callers.
23. [ ] U12-23 Authenticated administrator/staff E2E — intentionally deferred until a genuine staff session is available.
NEXT concrete implementation target: UI-16 minimal role workspaces / hospital-home-first landing is deployed as v474 and live frontend syntax parsing passes. Continue with safe automated role/permission contract checks and the remaining genuine hospital-staff E2E gates; do not count admin role-preview as staff E2E. Main frontend syntax parsing passes. Physical-device mobile verification remains open (drawer open/close, touch scroll, rotation, card/button taps and AI button anchoring). Continue all safe automated hardening and contract validation without waiting for a real staff session. Preserve the U12-23, U11, U10, U13, U14 and Billing authenticated E2E gates explicitly; role-preview and owner-level validation do not count as hospital-staff E2E. Do not fabricate financial/clinical history or mark unsupported mutation contracts complete. Pharmacy deterministic event-failure validation remains 3/3 and pharmacy production validation remains 11/11 with 0 violations. The first remaining UI gate is authenticated staff E2E for UI-02 appointment booking/check-in/cancel/no-show; because no genuine staff session is available, keep that gate open. Pharmacy production validation remains 11/11 with 0 violations when run against /api/pharmacy-stock-validation. Authenticated pharmacist/IPD E2E remains deferred. UI U13 Integrations and U14 Reporting/Analytics are published through v437, while U12-23 staff E2E, U11 E2E, U10 Theatre E2E, U13 integration E2E, U14 reporting E2E and Billing E2E remain open. Billing v433 repair remains 9/10 with 13 legacy ledger gaps; do not mark Billing complete.

### HMIS reference rule
For every U12 increment, inspect the relevant HMIS staff/privilege/configuration/audit code before implementation. Current references include `Privileges.java`, `UserPrivilageController.java`, `ConfigOption.java`, `ConfigOptionController.java`, `AuditEventController.java`, and `all_audit_events.xhtml`. Do not invent privilege categories, configuration semantics or audit behavior without checking the repository.

### CURRENT SAFE HARDENING QUEUE — v470 baseline
1. [x] Global responsive shell and AI assistant positioning hardening.
2. [x] Frontend JavaScript syntax regression repair and live parse verification.
3. [x] Continuation/UI-plan synchronization for the v470 baseline.
4. [x] Production 5xx hygiene pass — reviewed recent failures, confirmed the key Patient Workspace failure surface is authenticated-only, and hardened optional Patient Workspace reads in v471/v472 so a secondary section failure no longer aborts the whole workspace; core patient identity lookup remains strict.
5. [x] Safe integration boundary hardening pass — verified `/api/integration-capabilities` is public and non-secret (HTTP 200) and `/api/fhir/Patient` rejects anonymous access with FHIR OperationOutcome/401; LIS result-write remains disabled until verified authenticated adapter/session execution. Next: continue non-mutating integration contract checks and keep authenticated integration E2E open.
6. [ ] Financial reconciliation review: legacy payment-ledger gap remains open until source-backed historical payment rows are available; never synthesize ledger entries from invoice totals alone.
7. [ ] Authenticated hospital-staff E2E gates — execute only when a genuine staff session is available.
8. [ ] Physical-device mobile verification — manual device gate.

This file is the persistent next-task/reminder loop. It must never be left with an empty or stale NEXT TASK QUEUE.
# HMIS → CareFlow Test Cases

This file is the executable test checklist for the workflow-by-workflow HMIS implementation.

## Test policy

### TC-ARCHIVE-004 — Expanded report archive coverage
- Verify the hourly archive worker produces deterministic hospital-scoped keys for billing-audit, fixed-asset transfers/register/warranty/AMC JSON reports in addition to analytics, operations and audit archives.
- Verify missing MinIO configuration degrades to `configured:false` without failing the worker's live notification workflow.
- Do not manually invoke the scheduler during verification because the worker also processes WhatsApp reminders.
- Actual object PUT remains open until MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY and MINIO_BUCKET are configured in Hatchable secrets.

### TC-ARCHIVE-005 — Archive/notification scheduler isolation
- Verify `/api/archive-worker` is scheduler-gated and is scheduled at minute 30 of each hour.
- Verify `/api/notifications-worker` remains scheduler-gated at minute 0 of each hour.
- Verify the archive routine is shared through `lib/archive.js`, so notification execution cannot prevent the archive scheduler from running.
- Do not manually invoke either scheduler during verification because the notification worker can send WhatsApp reminders.
- Actual MinIO PUT remains an infrastructure gate until the configured secret-backed endpoint is available.

For every workflow:
1. Validate the intended happy path.
2. Validate role and permission boundaries.
3. Validate invalid state transitions.
4. Validate duplicate, concurrency, and idempotency behavior where relevant.
5. Validate canonical encounter continuity.
6. Validate workflow notifications/events.
7. Run automated safe API tests before deployment.
8. Run authenticated browser/staff tests before marking the workflow complete.

Automated tests must not mutate a real patient unless a dedicated test patient/session is explicitly used.

# Patient Registration / Lookup

## TC-PATIENT-021 — Identifier search coverage
Route: /api/patients; Method: GET; Actor: authenticated staff.
Expected: hospital-scoped lookup matches UHID/PHN-equivalent identifier, name, primary phone, alternate phone, and NIC/passport; formatted/unformatted phone matching works.
Status: Implemented v449; authenticated staff execution pending.

# Queue / Token / Reception

## TC-QUEUE-021 — Invalid queue transition
Route: /api/queue; Actor: authenticated staff.
Expected: invalid stage transition returns 409 and leaves queue state unchanged.
Status: Implemented; authenticated execution pending.

## TC-QUEUE-022 — Queue hospital isolation
Expected: queue mutation cannot access another hospital's entry.
Status: Implemented; authenticated execution pending.

## TC-QUEUE-023 — Token allocation concurrency
Expected: concurrent token allocation does not create duplicate hospital/date/sequence tokens.
Status: Implemented; authenticated execution pending.

# Appointments / OPD

## TC-OPD-021 — Appointment booking
Expected: valid appointment creates the appointment and canonical OPD encounter context.
Status: Implemented; authenticated staff E2E pending.

## TC-OPD-022 — Appointment check-in/token
Expected: check-in creates/reuses the canonical encounter and queue token atomically.
Status: Implemented; authenticated staff E2E pending.

## TC-OPD-023 — Appointment cancellation
Expected: cancellable appointment transitions to cancelled and cannot be checked in afterward.
Status: Implemented; authenticated staff E2E pending.

## TC-OPD-024 — Appointment no-show
Expected: no-show transition is explicit and cannot be checked in as an active appointment afterward.
Status: Implemented; authenticated staff E2E pending.

## TC-OPD-025 — Duplicate/concurrent check-in
Expected: repeated check-in does not create duplicate active queue entries/tokens.
Status: Implemented; authenticated staff E2E pending.

# Clinical / Doctor Consultation

## TC-UI-PS-001 — Patient Workspace consultation remains workspace-local
Expected: Start consultation from Patient Workspace/queue changes the existing queue state to in_room and opens consultation in the same patient workspace; no navigation to a separate Doctor Room page occurs. AI listening/summary remains inside the consultation workspace and is not duplicated as a Care Team navigation action. Status: Implemented v614; anonymous/browser visual execution reaches the staff login boundary, so authenticated mutation E2E remains pending.

## TC-CLINICAL-021 — Invalid consultation completion does not mutate the visit
Route: /api/clinical; Method: PUT type=visit.
Expected: invalid visit status returns 400; completed without a non-empty clinical note returns 400 before updating the visit.
Status: Hardened v438; authenticated execution pending.

## TC-CLINICAL-022 — Consultation completion closes workflow
Expected: completed consultation closes the doctor visit and relevant queue/appointment state while preserving the encounter.
Status: Implemented; authenticated execution pending.

## TC-CLINICAL-023 — Doctor assignment boundary
Expected: non-admin doctor cannot update another doctor's assigned patient/visit.
Status: Implemented; authenticated execution pending.

# Nursing / Vitals / Triage

## TC-NURSING-021 — Vitals record and queue progression
Expected: valid vitals record updates the encounter/queue and emits the vitals workflow event.
Status: Implemented; authenticated execution pending.

## TC-NURSING-022 — Triage acuity progression
Expected: triage stores acuity and maps priority to the canonical encounter.
Status: Implemented; authenticated execution pending.

## TC-NURSING-023 — Invalid vitals input
Expected: invalid required values return 400 without partial workflow mutation.
Status: Implemented; authenticated execution pending.

# Laboratory

## TC-LAB-021 — Lab order creation
Expected: authorized clinical staff can create a hospital-scoped lab order tied to patient/encounter.
Status: Implemented; authenticated execution pending.

## TC-LAB-022 — Lab result workflow
Expected: authorized result entry updates the order/result state and preserves patient/encounter linkage.
Status: Implemented; authenticated execution pending.

## TC-LAB-023 — Lab cross-hospital isolation
Expected: staff cannot read or mutate another hospital's lab records.
Status: Implemented; authenticated execution pending.

# Pharmacy

## TC-PHARM-009 — Dispense valid prescription
Expected: valid prescription is dispensed only from active, non-expired stock and returns allocated batches.
Status: Implemented; authenticated pharmacist E2E pending.

## TC-PHARM-010 — Insufficient pharmacy stock
Expected: insufficient non-expired stock returns 409 and does not create a dispense or stock movement.
Status: Implemented; authenticated pharmacist E2E pending.

## TC-PHARM-011 — Duplicate prescription dispense
Expected: a prescription already in terminal dispensed state returns 409 and cannot deduct stock again.
Status: Implemented; authenticated pharmacist E2E pending.

## TC-PHARM-012 — FEFO allocation
Expected: dispensing allocates eligible stock in expiry-first order without using expired stock.
Status: Implemented; authenticated pharmacist E2E pending.

## TC-PHARM-013 — Pharmacy hospital isolation
Expected: stock and dispensing queries remain hospital-scoped.
Status: Implemented; authenticated pharmacist E2E pending.

## TC-PHARM-030 — Transfer terminal status requires stock mutation
Route: /api/pharmacy-stock-transfers; Method: POST.
Expected: receive/cancel cannot mark a transfer terminal unless the corresponding destination/source stock mutation succeeds.
Status: Hardened v451; production validator 11/11, 0 violations; authenticated pharmacist E2E pending.

## TC-INVENTORY-031 — Pharmacy receipt retry/idempotency
Route: /api/pharmacy-stock; Method: POST action=receive.
Expected: optional idempotency key is persisted; retrying the same key cannot add stock twice and returns 409.
Status: Hardened v452; authenticated pharmacist execution pending.

## TC-PHARMACY-032 — Dispense workflow-event failure is non-fatal and observable
Route: /api/pharmacy; Method: POST.
Expected: if workflow-event persistence fails after the dispense transaction commits, the dispense still succeeds with workflow_event_recorded=false; a retry remains blocked by duplicate-dispense protection.
Status: Hardened v453; authenticated fault-injection execution pending.

## TC-PHARMACY-033 — Deterministic dispense event-repair boundary
Route: /api/pharmacy-dispense-validation; Method: GET; Actor: administrator/owner validation only.
Expected: simulated workflow-event persistence failure is caught as recorded=false, no marker event is written, and the PostgreSQL advisory-lock mechanism used by dispensing is available. No stock or dispense mutation is performed.
Status: Implemented v455; automated execution pending.

# IPD / Beds / Discharge

## TC-IPD-001 — Public bed access blocked
Expected: unauthenticated callers receive 401.
Status: Verified.

## TC-IPD-002 — Public admission access blocked
Expected: unauthenticated admission mutation receives 401.
Status: Verified.

## TC-IPD-003 — Public discharge access blocked
Expected: unauthenticated discharge mutation receives 401.
Status: Verified.

## TC-IPD-005 — Admission to available bed
Expected: authorized staff can admit to an available hospital-scoped bed.
Status: Implemented; authenticated execution pending.

## TC-IPD-006 — Occupied bed rejection
Expected: occupied/unavailable bed cannot receive a second admission.
Status: Implemented; authenticated execution pending.

## TC-IPD-007 — Duplicate active admission prevention
Expected: a patient cannot have conflicting duplicate active admission state.
Status: DB constraint/transaction hardened; authenticated execution pending.

## TC-IPD-008 — Edit active admission
Expected: active admission can be edited only within hospital scope and valid field values.
Status: Implemented; authenticated execution pending.

## TC-IPD-009 — Bed transfer atomicity
Expected: old/new bed state changes together or not at all.
Status: Implemented; authenticated execution pending.

## TC-IPD-010 — Unavailable transfer rejection
Expected: transfer to an unavailable bed returns 409 and leaves current bed unchanged.
Status: Implemented; authenticated execution pending.

## TC-IPD-011 — Incomplete discharge checklist blocks discharge
Expected: discharge cannot bypass required checklist completion.
Status: Implemented; authenticated execution pending.

## TC-IPD-012 — Successful discharge releases bed atomically
Expected: discharge marks admission terminal and releases its bed without partial state.
Status: Implemented; authenticated execution pending.

## TC-IPD-013 — Discharge cannot bypass checklist
Expected: terminal discharge is rejected until required checklist state is complete.
Status: Implemented; authenticated execution pending.

## TC-IPD-014 — Re-admit after discharge
Expected: a previously discharged patient can enter a new valid admission.
Status: Implemented; authenticated execution pending.

## TC-IPD-015 — Encounter continuity
Expected: admission/discharge retains canonical encounter linkage.
Status: Implemented; authenticated execution pending.

## TC-IPD-016 — OPD to IPD continuity
Expected: IPD admission from an OPD workflow preserves patient and encounter context.
Status: Implemented; authenticated execution pending.

## TC-IPD-019 — Missing discharge checklist update
Expected: missing checklist returns 404 rather than creating an unintended record.
Status: Hardened v441; authenticated execution pending.

## TC-IPD-020 — Terminal discharge checklist mutation blocked
Expected: checklist POST/PUT locks an active admission and rejects writes after discharge with 409.
Status: Hardened v450; authenticated concurrency execution pending.

# Billing

## TC-BILLING-021 — Invoice creation
Expected: authorized billing workflow creates a hospital-scoped invoice with correct total/status.
Status: Implemented; authenticated execution pending.

## TC-BILLING-022 — Payment recording
Expected: payment updates invoice paid balance/status and records the payment ledger.
Status: Implemented; authenticated execution pending.

## TC-BILLING-023 — Payment overrun protection
Expected: payment cannot exceed outstanding invoice balance.
Status: Implemented; authenticated execution pending.

## TC-BILLING-024 — Invoice/payment hospital isolation
Expected: billing records cannot cross hospital boundaries.
Status: Implemented; authenticated execution pending.

## TC-BILLING-025 — Legacy ledger audit
Expected: historical positive paid balances without invoice_payments are surfaced as legacy gaps rather than silently rewritten.
Status: v433 repair remains 9/10 with 13 legacy ledger gaps; do not mark complete.

# Theatre

## TC-THEATRE-021 — Procedure creation and room conflict
Expected: procedure creation respects hospital scope and prevents overlapping scheduled room use.
Status: Implemented; authenticated execution pending.

## TC-THEATRE-022 — Procedure state transition
Expected: valid theatre transitions are explicit and invalid terminal transitions return 409.
Status: Implemented; authenticated execution pending.

## TC-THEATRE-023 — Team assignment
Expected: duplicate team assignment is rejected without duplicate rows.
Status: Implemented; authenticated execution pending.

## TC-THEATRE-024 — Validation/revert workflow
Expected: completed procedures can be validated/reverted only through the authorized workflow.
Status: Implemented; authenticated execution pending.

## TC-THEATRE-025 — Ward return
Expected: completed procedure can return to ward once and updates the open encounter appropriately.
Status: Implemented; authenticated execution pending.

## TC-THEATRE-026 — Theatre production validator
Expected: all theatre integrity checks pass with zero violations.
Status: Production validator 22/22, 0 violations; authenticated staff E2E pending.

# Inventory / Assets

## TC-ASSET-026 — Duplicate asset code conflict
Expected: duplicate hospital-scoped asset_code returns HTTP 409 rather than leaking a database 500.
Status: Hardened; authenticated asset E2E and concurrent transfer execution pending.

## TC-ASSET-027 — Asset hospital isolation
Expected: asset reads/writes remain hospital-scoped.
Status: Implemented; authenticated execution pending.

## TC-ASSET-028 — Asset transfer integrity
Expected: asset transfer cannot produce conflicting source/destination state.
Status: Implemented; authenticated execution pending.

# Staff / Roles / Hospital Setup

## TC-U12-001 — Staff listing scope
Expected: staff administration is hospital-scoped and protected.
Status: Implemented; authenticated execution pending.

## TC-U12-002 — Role permission boundary
Expected: role permissions are server-authoritative and unauthorized actions return 403.
Status: Implemented; authenticated execution pending.

## TC-U12-003 — User permission override
Expected: explicit user permission overrides are scoped correctly and do not grant cross-hospital access.
Status: Implemented; authenticated execution pending.

## TC-U12-004 — Staff audit/history
Expected: staff changes produce auditable history visible only to authorized staff.
Status: v431; authenticated execution pending.

## TC-U12-005 — Staff availability
Expected: availability configuration is hospital-scoped and role-protected.
Status: v431; authenticated execution pending.

## TC-U12-006 — Hospital profile/configuration
Expected: administrators can manage hospital configuration within authorized scope.
Status: v431; authenticated execution pending.

## TC-U12-007 — Hospital modules/features/settings
Expected: module configuration is validated and protected.
Status: v431; authenticated execution pending.

## TC-U12-008 — Department configuration
Expected: departments remain hospital-scoped and valid.
Status: v431; authenticated execution pending.

## TC-U12-009 — Services/working hours/labels
Expected: configuration changes preserve valid service and working-hour state.
Status: v431; authenticated execution pending.

## TC-U12-010 — Configuration validation
Expected: hospital configuration validator returns zero violations.
Status: v431, 7/7 checks and 0 violations.

## TC-U12-021 — Documentation/test pass
Expected: U12 implementation, permissions, configuration and audit documentation remain synchronized; role-preview tooling is not counted as genuine staff E2E.
Status: Refreshed v463. U12 UI plan, continuation queue and test-case state are synchronized with v462/v463; configuration validation remains 7/7 with 0 violations, the staff/permission/configuration invariant suite remains 14/14 with 0 violations, and protected staff/setup routes remain anonymous-401 gated. Genuine administrator/staff browser E2E remains a separate open gate.

## TC-U12-022 — Automated access/contract verification
Expected: all staff/permission/hospital configuration invariants pass and protected anonymous routes return 401.
Status: v435, 14/14 invariants and 0 violations.

## TC-U12-023 — Authenticated administrator/staff E2E
Expected: genuine administrator/staff browser session completes the U12 workflows.
Status: Deferred until genuine staff session is available.

# Integrations

## TC-U13-001 — Integration settings access
Expected: integration settings are protected and hospital-scoped.
Status: Implemented v437; authenticated execution pending.

## TC-U13-002 — FHIR/public integration boundary
Expected: public discovery endpoints expose only intended non-secret metadata; protected operations remain gated.
Status: Implemented v437; authenticated integration E2E pending.

## TC-U13-003 — Integration capability contract
Expected: capability discovery remains stable and contains no credentials/secrets.
Status: Implemented v437.

# Reporting / Analytics

## TC-U14-001 — Reporting scope
Expected: reports and analytics are hospital-scoped.
Status: Open.

## TC-U14-002 — Reporting authorization
Expected: protected operational reports require the appropriate authenticated role.
Status: Open.

## AI-agent tool safety contract
`/api/ai-agent-tools` exposes a discoverable tool registry and permission-gated execution for read-only staff workflows. Each tool is hospital-scoped and executes fixed server-side queries; the model cannot submit arbitrary SQL, URLs or database operations. HMIS `AnthropicApiService` uses the same core agent pattern: declare tools, let the model request a named tool, execute a server-side handler, return the tool result, and continue the agent loop; some HMIS mutations remain deliberately in the normal UI. CareFlow should follow this pattern while preserving its hospital/role permission boundaries. Future write tools must reuse the existing API/function contract, permission guard, validation, idempotency and concurrency boundary before being exposed to an agent.

2026-10-02 verification: an anonymous GET to `/api/ai-agent-tools` returned HTTP 401, confirming the registry is not publicly discoverable at runtime. The deployed source was audited for fixed tool definitions, requirePermission gating and hospital_id scoping. The next expansion candidates are read-only laboratory worklist, IPD census and fixed-asset register tools; their underlying permissions were verified against existing CareFlow routes. No mutation tool was added in this pass because the project source editor rejected the attempted code patch, preventing an unsafe partial implementation.

## TC-AI-TOOLS-001 — Tool discovery
Expected: signed-in staff can discover only the declared CareFlow agent tools and their read-only metadata; no secrets are returned.

## TC-AI-TOOLS-002 — Tool permission boundary
Expected: each tool enforces its mapped CareFlow page permission and hospital scope; unauthorized access is rejected by the same server-side authorization layer used by the UI.

## TC-AI-TOOLS-003 — Tool hospital isolation
Expected: patient, queue, appointment, follow-up and billing tool queries are constrained to the authenticated staff member's hospital.

## TC-AI-TOOLS-004 — No arbitrary execution
Expected: tool input cannot become arbitrary SQL, URL fetches, code execution or unregistered tool dispatch.

## TC-AI-TOOLS-005 — Mutation gate
Expected: no write tool is exposed until its underlying CareFlow API/function has verified permission, validation, idempotency/concurrency and audit behavior. Sensitive operations must require explicit confirmation.

## TC-AI-TOOLS-006 — Assistant tool loop
Expected: the signed-in staff Assistant can request one of the declared read-only tools, the server executes it under the staff permission and hospital scope, and the model receives only the tool result. The loop is bounded; arbitrary SQL, URL fetching, code execution and unregistered tool names are unavailable.

## TC-AI-TOOLS-007 — Assistant fallback
Expected: if LiteLLM/tool execution fails, the assistant returns a controlled error and does not fabricate current hospital data or persist a false operational answer.
Expected: no write/mutation tool is exposed until its underlying CareFlow API/function contract has verified permission, validation, idempotency/concurrency and audit behavior.

## TC-AI-TOOLS-008 — Laboratory worklist tool
Expected: the read-only laboratory worklist is permission-gated, hospital-scoped, bounded to 300 rows, accepts only known status filters, and returns patient/test/status/doctor/result context without exposing mutation controls.
Status: Implemented and deployed v500; signed-in app-user execution returned 200 with bounded response. Genuine hospital-staff E2E remains pending.

## TC-AI-TOOLS-009 — Fixed-asset register tool
Expected: the read-only fixed-asset register is permission-gated, hospital-scoped, bounded to 300 rows, accepts only known lifecycle filters, and cannot create/update/transfer assets.
Status: Implemented and deployed v500; signed-in app-user execution returned 200 with an empty current asset set. Genuine hospital-staff E2E remains pending.

## TC-AI-TOOLS-010 — Pharmacy summary tool
Expected: the read-only pharmacy summary uses the existing clinical-view permission boundary, stays hospital-scoped, bounds stock/dispensing rows to 300, and exposes no dispense/stock mutation operation.
Status: Implemented and deployed v502 after correcting the query to the verified pharmacy_stock schema; signed-in app-user execution returned 200. Genuine pharmacist E2E remains pending.

## TC-AI-TOOLS-011 — Reporting summary tool
Expected: administrative reporting summary is permission-gated, hospital-scoped, bounded to 1–90 days, and returns appointment, patient, queue, billing, follow-up and active-IPD aggregates without mutation controls.
Status: Implemented and deployed v504; signed-in app-user execution returned 200 for a 30-day report. Genuine administrator/staff E2E remains pending.

# Document / Archive Continuity

## TC-ARCHIVE-001 — MinIO archive configuration
Expected: MinIO/S3-compatible endpoint, credentials, bucket and region are secret-backed; no archive credential is returned by application APIs.
Status: Configuration contract added in v504; actual credential presence/upload remains an infrastructure configuration gate.

## TC-ARCHIVE-002 — Scheduled rolling archive
Expected: the scheduler archives hospital-scoped operational JSON, audit events, invoice PDFs, lab-report PDFs and latest prescription PDFs using deterministic object keys; retries overwrite the same object rather than creating uncontrolled duplicates.
Status: Implemented in v504; scheduler is hourly because the platform minimum schedule interval is one hour. Live upload verification remains pending until MinIO credentials are configured.

## TC-ARCHIVE-003 — Archive isolation
Expected: archive object keys include the hospital scope and document/entity identity; no document is written under another hospital's prefix.
Status: Implemented by deterministic hospitals/{hospital_id}/... object keys; authenticated staff/infrastructure E2E remains pending.

# Completion gates

## TC-E2E-AUTH-001 — Demo role matrix
Expected: with CARE_FLOW_DEMO_MODE enabled, the synthetic demo identity resolves each supported role (admin, receptionist, nurse, doctor, lab, pharmacy, billing, store) with the role-specific permission set; invalid role input falls back to admin; demo mode is explicitly reported and never represents a real staff account.
Status: Verified on the deployed build through /api/public-staff-status. All 8 supported roles returned HTTP 200 with distinct role/permission payloads; invalid role input resolved to admin. Real OTP/browser authentication and demo-mode-off behavior remain separate open gates.

## TC-E2E-VISUAL-001 — Demo visual runner entry
Expected: the admin-only visual runner can request a demo role without exposing credentials and can capture the target UI at desktop/mobile sizes; demo execution is labeled separately from genuine staff E2E.
Status: Runner supports validated demo_role input and safe demo login plumbing. v624 rerun used the Groq/LiteLLM-capable visual flow agent; it correctly stopped at the genuine staff-auth boundary (protected Patient Workspace/appointments returned 401), so no Patient Workspace visual E2E completion is claimed. A desktop run also hit a browser navigation timeout, which remains a runner-environment issue.

Demo-mode E2E is now available through the explicit CARE_FLOW_DEMO_MODE secret. It may be used to exercise application workflows, role boundaries, invalid transitions, retries and concurrency without real OTP authentication, and all results must be labeled demo E2E.

Visual/UI E2E is now a first-class test layer. The admin-only /api/e2e-visual runner uses Hatchable Chromium at desktop/mobile viewports, captures top/middle/bottom screenshots to project storage, exercises safe visible interactions, and sends screenshots to Groq with a direct LiteLLM fallback pinned to Gemini 2.5 Flash Lite. v487 confirmed the LiteLLM path returns HTTP 200 visual reviews. Visual findings must be reproduced by browser assertions before being treated as defects. AI summaries are retained in public/AI_VISUAL_REPORTS.json for later improvement/validation loops.

## TC-UX-FEEDBACK-001 — Patient Workspace mutation feedback
Expected: successful POST/PUT/DELETE actions show a bottom-of-screen confirmation toast; failed mutations show a bottom error toast; notification-center toasts remain clickable; feedback must not navigate away from Patient Workspace. Status: Implemented in v624 and covered by frontend contract inspection; browser click/persistence verification remains part of the genuine staff E2E gate.

## TC-UX-CONTRACT-002 — Investigation order contract
Expected: Patient Workspace Order investigation uses a supported clinical mutation contract and does not call POST /lab, because the lab route accepts GET/PUT only. Status: Fixed in v624; workspace now requires an open consultation and submits the lab order through POST /clinical with visit/encounter context.

Genuine hospital-staff OTP/browser E2E remains a separate production-authentication gate and must not be marked complete from demo mode. APP END USER or collaborator sessions must not be counted as genuine staff E2E.

Current master E2E queue: E2E-AUTH → E2E-RECEPTION → E2E-QUEUE → E2E-NURSING → E2E-DOCTOR → E2E-LAB → E2E-PHARMACY → E2E-BILLING → E2E-IPD → E2E-THEATRE (only when requested) → E2E-INVENTORY → E2E-STAFF → E2E-INTEGRATIONS → E2E-REPORTING → E2E-CROSSCUT → E2E-RELEASE.

Safety gates remain: Billing legacy reconciliation, authenticated LIS result-write, genuine hospital-staff OTP E2E, and physical-device mobile verification.
# HMIS → CareFlow Test Cases

This file is the executable test checklist for the workflow-by-workflow HMIS implementation.

## Test policy

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

# Completion gates

Authenticated staff/pharmacist/doctor/nurse/admin E2E remains required before marking the corresponding workflow complete. The current harness does not provide a genuine hospital staff browser session; APP END USER or collaborator sessions must not be counted as staff E2E.
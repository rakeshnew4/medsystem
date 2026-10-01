# HMIS → CareFlow Test Cases\n\nThis file is the executable test checklist for the workflow-by-workflow HMIS implementation.\n\n## Test policy\n\nFor every workflow:\n1. Validate the intended happy path.\n2. Validate role and permission boundaries.\n3. Validate invalid state transitions.\n4. Validate duplicate, concurrency, and idempotency behavior where relevant.\n5. Validate that the canonical encounter remains attached.\n6. Validate workflow notifications and events.\n7. Run automated safe API tests before deployment.\n8. Run an authenticated browser/staff test before marking the workflow complete.\n\nAutomated tests must not mutate a real patient unless a dedicated test patient/session is explicitly used.\n\n# Patient Registration / Lookup\n\n## TC-PATIENT-021 — Identifier search coverage\nRoute: /api/patients; Method: GET; Actor: authenticated staff.\nExpected: hospital-scoped lookup matches existing patients by UHID/PHN-equivalent identifier, name, primary phone, alternate phone, and NIC/passport without requiring a second patient master. Phone matching accepts formatted and unformatted representations.\nStatus: Backend/UI increment implemented in v449; authenticated staff execution remains pending. External schema verification confirmed patient_identity.nic_passport and patient_identity.alternate_phone; production contains 126 patients, 123 with UHID and 125 with phone.\n\n# Queue / token

## TC-CLINICAL-021 — Invalid consultation completion does not mutate the visit
Route: /api/clinical; Method: PUT type=visit; Actor: authenticated doctor/admin.
Expected: invalid visit status returns HTTP 400; completed without a non-empty clinical note returns HTTP 400 before updating the doctor_visits row. Existing visit status/notes/ended_at remain unchanged.
Status: Server-side hardened in v438; authenticated execution pending.

## TC-QUEUE-021 — Invalid queue transition is rejected
Route: /api/queue; Method: PUT; Actor: authenticated non-admin staff.
Expected: generic queue edits may only follow the HMIS-aligned forward state machine (waiting → vitals → doctor → in_room → downstream completion stages). Backward/sideways jumps return HTTP 409 and create no queue, encounter or workflow-event mutation.
Status: Implemented in v379; authenticated execution pending.

## TC-QUEUE-022 — Completed queue is terminal
Route: /api/queue; Method: PUT; Actor: authenticated non-admin staff.
Expected: a completed queue item cannot move back to an earlier stage; server returns HTTP 409.
Status: Implemented in current draft; authenticated execution pending.

## TC-QUEUE-023 — Encounter continuity on valid queue transition
For a valid queue transition, the linked canonical encounter remains the same patient/hospital encounter and its current stage/status is updated consistently; exactly one stage-change workflow event is recorded.
Status: Existing implementation; authenticated end-to-end verification pending.

# Laboratory

## TC-LAB-021 — Verification/report atomicity
When a laboratory result is verified, the lab order status update, clinical report creation and queue handoff must commit as one database operation. If clinical report creation fails, the lab order must remain in processing and no queue handoff may occur.
Status: Implemented in v440; automated authenticated execution remains pending.\n\n## TC-LAB-001 — Public access is blocked\nRoute: /api/lab; Method: GET; Actor: Anonymous.\nExpected: HTTP 401.\nStatus: Automated.\n\n## TC-LAB-002 — Signed-in non-staff is blocked\nRoute: /api/lab; Method: GET; Actor: signed-in app user without hospital staff registration.\nExpected: HTTP 403 from staff authorization.\nStatus: Automated where test user is available.\n\n## TC-LAB-003 — Authorized lab staff can read the lab queue\nRoute: /api/lab; Method: GET; Actor: Lab staff.\nExpected: Orders are restricted to the hospital and returned newest-first.\nStatus: Requires authenticated staff session.\n\n## TC-LAB-004 — Doctor creates a lab order from an active consultation\nRoute: /api/clinical; Method: POST type=lab; Actor: assigned doctor.\nPreconditions: Patient has an open encounter and open doctor visit.\nExpected: lab order is created as ordered; patient, visit, encounter and doctor remain consistent; lab_ordered event and lab notification are created.\nStatus: Requires authenticated staff session.\n\n## TC-LAB-005 — Lab order without active encounter is rejected\nRoute: /api/clinical; Method: POST type=lab.\nExpected: HTTP 409 and no lab order created.\nStatus: Automated after authenticated test fixture exists.\n\n## TC-LAB-006 — Non-doctor cannot create a lab order\nRoute: /api/clinical; Method: POST type=lab; Actor: nurse/lab/receptionist.\nExpected: HTTP 403.\nStatus: Requires authenticated staff session.\n\n## TC-LAB-007 — Ordered to sample collected\nRoute: /api/lab; Method: PUT status=sample_collected; Actor: Lab staff.\nExpected: status becomes sample_collected, sample_collected_at is populated, and lab_sample_collected event is recorded.\nStatus: Requires authenticated staff session.\n\n## TC-LAB-008 — Unpaid billed investigation cannot be collected\nRoute: /api/lab; Method: PUT status=sample_collected.\nPrecondition: Linked invoice exists and is not paid.\nExpected: HTTP 409; status remains ordered.\nStatus: Requires authenticated staff session.\n\n## TC-LAB-009 — Sample collected to processing\nRoute: /api/lab; Method: PUT status=processing; Actor: Lab staff.\nExpected: status becomes processing, processing_started_at is populated, and lab_processing_started event is recorded.\nStatus: Requires authenticated staff session.\n\n## TC-LAB-010 — Processing cannot be skipped\nRoute: /api/lab; Method: PUT status=verified from sample_collected.\nExpected: HTTP 409; result is not accepted as verified.\nStatus: Automated after authenticated test fixture exists.\n\n## TC-LAB-011 — Verification requires a result\nRoute: /api/lab; Method: PUT status=verified with empty result.\nExpected: HTTP 400; order remains processing.\nStatus: Automated after authenticated test fixture exists.\n\n## TC-LAB-012 — Processing to verified\nRoute: /api/lab; Method: PUT status=verified with result; Actor: Lab staff.\nExpected: verified status, result_summary, completed_at, verified_at, verified_by and doctor_notified_at are populated; clinical lab-result report is created; lab_result_verified event is recorded; doctor notification is created; linked queue item moves lab to followup.\nStatus: Requires authenticated staff session.\n\n## TC-LAB-013 — Verified result cannot be verified twice\nRoute: /api/lab; Method: PUT status=verified again.\nExpected: HTTP 409 and no second verification transition.\nStatus: Automated after authenticated test fixture exists.\n\n## TC-LAB-014 — Cancellation rules\nExpected: ordered to cancelled allowed; sample_collected to cancelled allowed; processing to cancelled rejected; verified to cancelled rejected.\nStatus: Requires authenticated staff session.\n\n## TC-LAB-015 — Hospital isolation\nExpected: staff from hospital A cannot read or modify hospital B laboratory orders.\nStatus: Requires multi-hospital authenticated fixtures.\n\n## TC-LAB-016 — Encounter integrity\nExpected: lab order, clinical report, doctor visit and queue entry retain the same canonical encounter where supplied.\nStatus: Requires authenticated end-to-end test.\n\n## TC-LAB-017 — Doctor sees verified laboratory result\nExpected: patient clinical workspace shows the verified result and report in the same patient/encounter context.\nStatus: Requires authenticated browser test.\n\n## TC-LAB-018 — Refresh/resume during laboratory workflow\nExpected: lab staff can refresh or return to the application and resume the current patient's laboratory action without losing order context.\nStatus: Browser test.\n\n## TC-LAB-019 — Full OPD to laboratory journey\nScenario: registration → appointment/check-in → token → vitals → triage → nursing handoff → doctor room → consultation → lab order → billing/payment → sample collection → processing → verification → doctor review.\nExpected: no orphan queue, encounter or clinical records; every stage has the correct owner and timestamp.\nStatus: Full authenticated E2E gate.\n\n## TC-LAB-020 — Browser role boundary\nActors: Doctor, Lab, Billing/Receptionist.\nExpected: Doctor can order and review results; Lab can collect/process/verify; Billing/Reception can handle applicable payment workflow; no role gets another role's mutation controls merely because the UI is visible.\nStatus: Browser + API test.\n\n# Workflow completion gate\n\nA workflow is marked Complete only when all applicable automated cases pass, authenticated happy-path E2E passes, role-boundary cases pass, invalid-transition cases pass, encounter linkage is verified, notifications/events are verified, and the plan records the exact deployed version.\n\nCurrent Laboratory state: In progress.

# Pharmacy

## TC-PHARM-001 — Public stock access is blocked
Route: /api/pharmacy-stock; Method: GET; Actor: Anonymous.
Expected: HTTP 401.
Status: Automated — passed in v236.

## TC-PHARM-002 — Signed-in non-staff stock access is blocked
Route: /api/pharmacy-stock; Method: GET; Actor: signed-in app user without hospital staff registration.
Expected: HTTP 401 from hospital staff authorization.
Status: Automated — passed in v236.

## TC-PHARM-003 — Pharmacist can receive stock
Route: /api/pharmacy-stock; Method: POST action=receive; Actor: Pharmacy staff.
Expected: Medicine batch is created or accumulated by hospital + medicine + batch, with expiry, quantity and reorder level.
Status: Requires authenticated staff session.

## TC-PHARM-004 — Duplicate batch receipt accumulates quantity
Receive the same medicine and batch twice.
Expected: One batch remains and quantity increases by the second receipt amount.
Status: Requires authenticated staff session.

## TC-PHARM-005 — Invalid stock receipt rejected
Submit missing medicine, batch or non-positive quantity.
Expected: HTTP 400 and no stock mutation.
Status: Automated after authenticated staff fixture exists.

## TC-PHARM-006 — Expired stock is visible but not usable
Create a batch whose expiry is before today.
Expected: It is visible in inventory/expiry summary but cannot be used for dispensing.
Status: Requires authenticated staff session.

## TC-PHARM-007 — Low-stock alert state
Set quantity at or below reorder level.
Expected: Pharmacy dashboard counts the batch as low stock.
Status: Browser + API test.

## TC-PHARM-008 — Prescription is visible to pharmacy
Create a doctor prescription for a patient.
Expected: Pharmacy queue/list shows patient, medicine, dose, frequency, duration and encounter context.
Status: Requires authenticated doctor/pharmacist session.

## TC-PHARM-009 — Dispensing requires available stock
Attempt to dispense more than available non-expired stock.
Expected: HTTP 409, no dispense record, and no stock quantity mutation.
Status: Implemented in v238; authenticated pharmacist execution pending.

## TC-PHARM-010 — Successful dispensing consumes stock atomically
Dispense a valid prescription quantity, including a quantity that spans multiple non-expired batches when necessary.
Expected: stock is deducted atomically in expiry-first order, pharmacy dispense is created once, one stock transaction is recorded per consumed batch, and the linked pharmacy queue item advances to completed.
Status: Implemented in v238; authenticated pharmacist execution pending.

## TC-PHARM-011 — Retry/idempotency protection
Repeat the same dispense action after successful completion.
Expected: HTTP 409 for an already-dispensed prescription; no second dispense and no second stock deduction.
Status: Implemented in v238; authenticated pharmacist execution pending.

## TC-PHARM-012 — Encounter linkage
Expected: medication, dispense, stock transaction and pharmacy queue retain the same canonical encounter where supplied.
Status: Pending authenticated E2E.

## TC-PHARM-013 — Hospital isolation
Staff from hospital A cannot read or mutate hospital B stock, prescriptions or dispense records.
Status: Requires multi-hospital authenticated fixtures.

## TC-PHARM-014 — Role boundary
Pharmacist can receive/dispense; doctor can prescribe; receptionist/billing cannot mutate pharmacy stock merely because Pharmacy is visible in the UI.
Status: Browser + API test.

## TC-PHARM-015 — Full OPD pharmacy journey
Scenario: registration → appointment/check-in → token → vitals → triage → doctor consultation → prescription → pharmacy queue → stock check → dispense → completed queue.
Expected: no orphan medication, dispense, queue or encounter records; every mutation has the correct role and audit trail.
Status: Full authenticated E2E gate.

## Pharmacy completion gate
Pharmacy is marked Complete only after atomic stock consumption, authenticated pharmacist happy-path E2E, role boundaries, insufficient/expired-stock cases, encounter linkage, workflow events and retry/idempotency behavior pass.

# Theatre / procedures

## TC-THEATRE-001 — Public access blocked
GET /api/theatre anonymously must return HTTP 401.
Status: Verified in v299 — HTTP 401.

## TC-THEATRE-002 — Procedure requires patient and name
POST without patient_id or procedure_name must return HTTP 400.
Status: Implemented.

## TC-THEATRE-003 — Admission belongs to patient
A procedure cannot link an admission belonging to another patient.
Status: Implemented.

## TC-THEATRE-004 — Discharged admission blocked
A new procedure cannot be scheduled against a discharged admission.
Status: Implemented.

## TC-THEATRE-005 — Schedule validation
Invalid dates or end <= start are rejected.
Status: Implemented.

## TC-THEATRE-006 — Theatre room overlap
Overlapping scheduled/in-progress procedures in the same hospital theatre room are rejected.
Status: Implemented in v275 with transaction-scoped advisory locking and atomic conflict recheck; external PostgreSQL schema is now applied and validator reports 0 active overlaps. Concurrent authenticated execution remains pending.

## TC-THEATRE-007 — Lifecycle
Only scheduled → in_progress → completed and scheduled → cancelled are accepted.
Status: Implemented in v275; transition update now requires the expected prior status, preventing stale concurrent updates.

## TC-THEATRE-008 — Completion requires outcome
A procedure cannot become completed without an outcome.
Status: Implemented.

## TC-THEATRE-009 — Encounter continuity
Admission-linked procedure uses the open canonical IPD encounter when available.
Status: Implemented; authenticated E2E pending.

## TC-THEATRE-010 — Workflow audit
Scheduling and lifecycle transitions create workflow events.
Status: Implemented; authenticated verification pending.

## TC-THEATRE-011 — Role boundary
Admin/doctor/nurse may manage theatre; other roles cannot mutate procedures.
Status: Permission implemented; authenticated role test pending.

## TC-THEATRE-012 — Full journey
Admission → procedure scheduling → theatre start → completion → billing linkage → ward return.
Status: Full authenticated E2E gate.

## TC-THEATRE-013 — Patient Workspace Theatre context
Permitted doctor/nurse staff can see Theatre procedures for the selected patient and only active-admission patients can schedule new procedures.
Status: Implemented in v261; authenticated browser test pending.

## TC-THEATRE-014 — Theatre room/doctor selection
Scheduling UI loads hospital-scoped theatre rooms and active doctor profiles and sends the selected IDs to the protected API.
Status: Implemented in v261; authenticated browser test pending.

## TC-THEATRE-015 — Standalone Theatre workbench
Permitted doctor/nurse users can navigate to the Theatre section and see hospital-scoped procedure records and room summary.
Status: Implemented in v263; authenticated browser test pending.

## TC-THEATRE-016 — Start/cancel/complete controls
The workbench exposes only valid lifecycle actions; completion prompts for and submits an outcome.
Status: Implemented in v263; authenticated browser test pending.

## TC-THEATRE-017 — Procedure history
Patient Workspace displays scheduled/completed/cancelled procedure history without exposing another hospital's records.
Status: Implemented in v261; authenticated browser test pending.

## TC-THEATRE-018 — Theatre master data
Administrator can create/update hospital-scoped theatre rooms and procedure catalogue records; non-admin theatre users cannot mutate master data.
Status: Implemented in v265; authenticated role test pending.

## TC-THEATRE-019 — Admission-profile entry
Active IPD admission profile exposes a Theatre/Procedure entry point; discharged admissions cannot schedule new procedures.
Status: Implemented in v265; authenticated browser test pending.

## TC-THEATRE-020 — Theatre charge creation
Billing/admin can create a hospital-scoped Theatre charge tied to a procedure; invalid amounts and unknown procedures are rejected. Source-linked charges must also reference an existing same-hospital source, and medicine/pharmacy-dispense sources must belong to the procedure patient.
Status: Implemented in v293; anonymous route protection and production charge/procedure isolation are verified; source_type/charge_type mismatches are rejected; authenticated execution pending.

## TC-THEATRE-021 — Charge-to-invoice linkage
A Theatre charge can be linked once to an invoice belonging to the same patient; linking is idempotency-protected and invoice subtotal/total/status are recalculated.
Status: Atomic implementation hardened in v299; authenticated execution pending.

## TC-THEATRE-024 — Charge type validation
Theatre billing accepts only procedure, theatre_service, professional_fee, medicine, or consumable charge categories and rejects arbitrary categories.
Status: Implemented in v273; public access protection and database uniqueness/invoice-line invariants verified; authenticated execution pending.

## TC-THEATRE-023 — Billing-side Theatre reconciliation
Billing users can view unbilled Theatre charges, see same-patient recent invoices and link a charge once; linked charges display invoice continuity.
Status: Implemented in current draft; authenticated execution pending. v275 also makes ward return idempotent under concurrent retries.

## TC-THEATRE-022 — Theatre-to-ward handoff
Only a completed, not-yet-returned admission-linked procedure with its current open canonical IPD encounter can be returned to the ward; the handoff is recorded and the encounter returns to current_stage=ipd.
Status: Hardened in v301; non-admission or missing-encounter ward returns are now rejected; authenticated execution pending.

## TC-THEATRE-026 — Source identity/category integrity
A Theatre charge may use only a verified source type: theatre_service → theatre_service charge, medicine/pharmacy_dispense → medicine charge. `professional_fee` remains a valid charge category but cannot be presented as a fabricated source identity until a verified professional-fee source entity exists.
Status: Implemented in v294; automated production validator includes source-type/charge-type consistency; authenticated mutation test pending.

## TC-THEATRE-027 — Active IPD continuity during Theatre lifecycle
Admission-linked procedures cannot start or complete after the admission is discharged, and the linked encounter must remain open, hospital/patient/admission consistent.
Status: Implemented in the current increment; production validator added, authenticated mutation test pending.

## TC-THEATRE-028 — Room availability race
Scheduling rechecks the theatre room's available state inside the same transaction that takes the room overlap lock, preventing a room-status race between initial validation and insertion.
Status: Implemented in the current increment; concurrent authenticated execution pending.

## TC-THEATRE-029 — Surgical team continuity
HMIS surgery_clinical_details.xhtml records surgical team members by role against the surgery. CareFlow must allow only active same-hospital staff to be attached to a Theatre procedure, prevent duplicate staff+role assignments, record add/remove workflow events, and expose the team in Patient Workspace.
Status: Implemented in v305; external schema applied and Patient Workspace/API exposure verified. Authenticated mutation/role test pending.

## TC-THEATRE-030 — Theatre lifecycle timestamp integrity
A procedure in progress must have started_at; a completed procedure must have both started_at and completed_at with completed_at >= started_at; a cancelled procedure must have cancelled_at. Scheduled timing must never have end <= start.
Status: Automated production invariant added and passed; authenticated transition execution pending.

## TC-THEATRE-025 — Production Theatre integrity validation
Verify Theatre procedure states, completed-outcome requirements, ward-return state, admission/encounter continuity, active room overlap, duplicate source-charge protection, duplicate invoice-item linkage, linked-charge invoice-line continuity, room availability, source-record validity, and completed-procedure billing continuity directly against the production database.
Status: Automated production invariant check passed: the original eight integrity/isolation checks returned zero violations; v287 added four additional checks (completed-without-outcome, scheduled-on-unavailable-room, invalid theatre-service source, invalid medicine/pharmacy-dispense source), all zero against the external PostgreSQL database; v288 added invoice-item identity/amount continuity and charge-patient continuity checks, also zero. The current HMIS-aligned increment also audits completed procedures with unlinked Theatre charges; authenticated execution remains pending.

## TC-THEATRE-031 — HMIS-aligned Surgery Validation / financial closure
Route: /api/theatre-validate; Method: POST; Actor: billing/admin with Theatre validation permission.
Expected: only a completed, unvalidated procedure can be validated; every Theatre charge must already have both invoice_id and invoice_item_id; validation records validated_at/validated_by and creates a theatre_procedure_validated workflow event.
Status: Implemented in v310; anonymous access returns HTTP 401. Authenticated execution pending.

## TC-THEATRE-035 — HMIS-style Surgery Validation Revert
Route: /api/theatre-validation-revert; Method: POST; Actor: billing/admin with validation-revert permission.
Expected: only a completed, currently validated procedure can be reverted; a non-empty reason is required; validation fields are cleared so controlled corrections can proceed; revert actor/time/reason are retained and a `theatre_procedure_validation_reverted` workflow event is created. Doctor/nurse Theatre management does not grant this authority.
Status: Implemented; authenticated execution remains pending.

## TC-THEATRE-034 — Surgery Validation permission boundary
Route: /api/theatre-validate; Method: POST; Actor: billing/admin vs doctor/nurse.
Expected: billing/admin can reach the validation handler; doctor/nurse do not receive validation authority merely from Theatre management. The endpoint remains protected by the hospital staff auth plane.
Status: Implemented in v314; external production permission verified for admin and billing. Real staff-session execution remains pending.

## TC-THEATRE-032 — Validated procedure is immutable for team/billing additions
After Surgery Validation succeeds, adding/removing surgical team members and creating/linking Theatre billing changes must be rejected.
Expected: HTTP 409 with no mutation.
Status: Server-side lockout implemented in v312; authenticated execution pending.

## TC-THEATRE-033 — Validated procedure remains clinically closed
A validated completed procedure remains terminal and cannot re-enter an earlier lifecycle state.
Status: Existing lifecycle state machine enforces terminal completion; authenticated execution pending.

## Theatre completion gate
Do not mark Theatre Complete until authenticated happy-path E2E, role boundaries, invalid transitions, overlap protection, encounter continuity, workflow events and billing continuity pass. HMIS-aligned Surgery Validation is now an additional financial-closure gate.

# Billing / charges / payments

## TC-BILL-001 — Public billing access is blocked
GET /api/billing anonymously.
Expected: HTTP 401.
Status: Automated — passed in v255.

## TC-BILL-002 — Overpayment is rejected
Create or update an invoice with paid greater than total.
Expected: HTTP 400 and no financial mutation.
Status: Server validation implemented; authenticated execution pending.

## TC-BILL-003 — Negative payment is rejected
Initial or subsequent payment below zero.
Expected: HTTP 400.
Status: Server validation implemented; authenticated execution pending.

## TC-BILL-004 — Invalid bill item is rejected
Missing description, non-positive quantity or negative price.
Expected: HTTP 400.
Status: Server validation implemented; authenticated execution pending.

## TC-BILL-005 — Invalid discount/tax is rejected
Discount below zero/above subtotal or negative tax.
Expected: HTTP 400.
Status: Server validation implemented; authenticated execution pending.

## TC-BILL-006 — Invoice-number concurrency safety
Concurrent invoice creation must not rely on MAX(id)+1 and must retain unique invoice numbers.
Status: Implemented in v255.

## TC-BILL-007 — Partial then final payment
E2E fixture invoice transitions unpaid → partial → paid and outstanding balance reaches zero.
Status: Authenticated E2E pending.

## TC-BILL-008 — Patient billing continuity
Invoice remains linked to the E2E patient and appears in patient workspace/journey.
Status: Authenticated E2E pending.

## TC-BILL-009 — Billing role boundary
Billing/receptionist may mutate billing according to configured permissions; clinical-only roles cannot.
Status: Authenticated role E2E pending.

## TC-BILL-010 — Billing E2E fixture
Dedicated E2E Test Patient and unpaid invoice exist and are labeled E2E TEST DATA.
Status: Fixture created.

## TC-BILL-011 — Payment ledger
Every non-zero invoice payment creates one immutable invoice_payments row with amount, method, reference, receiver and timestamp.
Status: Implemented in v258. Production audit: 946 pre-ledger invoices have positive paid balances without ledger rows; this is legacy data, not orphan payment rows. Reconciliation remains an open completion-gate item.

## TC-BILL-012 — Incremental payment
Payment PUT accepts a payment amount, adds it to the existing paid balance, and never overwrites prior payments.
Status: Implemented in v258; authenticated execution pending.

## TC-BILL-013 — Concurrent payment safety
Two concurrent payment attempts cannot push the invoice paid balance above total; one may fail cleanly with HTTP 409.
Status: Transactional row-locking implemented in v258; authenticated concurrency test pending.

## TC-BILL-014 — Invoice payment history
GET /api/billing?id=<invoice> returns the invoice plus ordered payment history.
Status: Implemented in v258.

## TC-BILL-015 — Insurance validation
Insurance claim amounts must be finite/non-negative and claim status must use the supported lifecycle.
Status: Implemented in v258.

## TC-BILL-016 — Invoice PDF continuity
Invoice PDF uses the same invoice, patient, line items, total, paid and due balance.
Status: Endpoint exists; authenticated browser/PDF verification pending.

## TC-BILL-017 — Legacy payment-ledger reconciliation
Pre-ledger invoices with a positive `invoices.paid` balance must be reconciled into `invoice_payments` without changing the authoritative invoice total/paid balance or creating duplicate payment rows.
Status: Production audit found 946 legacy invoices requiring reconciliation; mutation/backfill is intentionally not claimed complete. New invoice creation is now atomic: invoice + line items + initial payment ledger entry commit together, so newly created invoices cannot create a ledger gap through a partial write.

## TC-BILL-018 — Hospital staff session gate
The automated end-to-end harness must establish a real CareFlow hospital staff session before executing billing mutations; an app-user session that is rejected by `requireStaff()` does not count as authenticated hospital-staff E2E.
Status: Open. The current automated runner cannot establish the hospital staff auth/role session; no authenticated billing completion is claimed.

## TC-BILL-019 — Production billing integrity validator
The owner-only validator audits invoice paid/status bounds, invoice-item arithmetic, invoice subtotal continuity, payment positivity and bounds, and payment/invoice hospital integrity.
Status: Rechecked in v433 after repairing the external payment-ledger schema: 9/10 checks pass with 0 structural financial violations. The remaining failure is the explicit `legacy_payment_ledger_gap`: 13 existing pre-ledger paid invoices have positive `invoices.paid` balances without `invoice_payments` rows. Authenticated billing E2E remains required and this validator is not a substitute for staff-session testing.

## TC-BILL-020 — Legacy payment-ledger reconciliation gate
Audit all pre-ledger invoices with positive invoices.paid and no invoice_payments row. Do not fabricate payment method, reference, receiver or timestamp data. Any reconciliation must preserve the authoritative invoice total/paid balance and be idempotent.
Status: Open. Production audit currently reports 946 invoices totaling ₹491,500 requiring source-backed reconciliation.

## TC-BILL-021 — Validator/runtime consistency
The owner-only production validator must agree with direct read-only checks against the external PostgreSQL adapter.
Expected: no validator runtime query failures; any discrepancy blocks release validation.
Status: Reworked in v408 to avoid the adapter's unreliable information_schema table probe; the validator now probes the actual invoice_payments relation read-only. Post-deploy execution of the owner-only validator is still restricted by the available automation safety harness, so authenticated/owner validation remains an explicit gate.

## TC-BILL-022 — Payment-ledger validator adapter compatibility
The owner-only billing integrity validator must execute every payment-ledger query successfully through CareFlow's configured external PostgreSQL adapter. Adapter-safe aggregate queries must not be treated as financial passes unless the query itself executes; any runtime query error keeps the validator gate failed.
Status: v408 hardens schema detection by querying the actual invoice_payments relation through the configured adapter instead of information_schema. Anonymous billing access is 401; the available signed-in app-user harness reaches requireStaff() and is also rejected. Hospital-staff authenticated E2E remains required.

## TC-BILL-022 — Payment-ledger validator adapter compatibility
The owner-only billing integrity validator must execute every payment-ledger query successfully through CareFlow's configured external PostgreSQL adapter. Adapter-safe aggregate queries must not be treated as financial passes unless the query itself executes; any runtime query error keeps the validator gate failed.
Status: Implemented in v383/v384; external payment-ledger runtime remains unresolved. Authenticated Billing E2E remains required.

## TC-BILL-023 — Payment-ledger schema gate semantics
The owner-only validator must treat invoice_payments table presence as a positive schema assertion: exactly one matching public table is a pass, absence is a failure. If the schema is absent through the configured external adapter, dependent ledger checks must fail explicitly as schema-unavailable rather than as generic database query errors.
Status: Implemented and deployed in v433. The owner-only fixed-schema repair endpoint created/verified `invoice_payments` through the configured external PostgreSQL adapter; the post-deploy validator now reaches every ledger query successfully. Billing remains incomplete because the legacy reconciliation gate and authenticated staff E2E are still open.

## TC-BILL-024 — Billing worklist UI search/filter
Billing worklist exposes invoice, patient, UHID and phone search plus unpaid/partial/paid filters; filtering is client-side over the already hospital-scoped billing response and does not bypass server authorization.
Status: Deployed in v408; authenticated browser verification remains pending.

## TC-BILL-025 — Billing patient context UI
Selecting a patient from the billing worklist opens the existing Patient Workspace context without changing invoice/payment state.
Status: Deployed in v408; authenticated browser verification remains pending.

## TC-BILL-026 — Financial audit/history UI
Invoice detail exposes a read-only Audit history action backed by /api/billing-audit. The endpoint is hospital-scoped and permission-protected and returns payment ledger entries, billing workflow events, and matching invoice audit events without mutation.
Status: Deployed in v415; anonymous access returns 401; authenticated browser verification remains pending.

## TC-BILL-026 — Billing unauthenticated boundary
GET /api/billing as anonymous must return HTTP 401, and a signed-in app-user session that is not registered as hospital staff must not reach billing data or mutations.
Status: Verified in v408 for anonymous GET (401) and the available signed-in app-user harness (401 from requireStaff). This does not satisfy hospital-staff E2E.

## TC-BILL-027 — Billing financial transition safety
A hospital-staff E2E fixture must prove unpaid → partial → paid, reject overpayment/negative payment, preserve payment history, and reject concurrent over-settlement without invoice or ledger corruption.
Status: Open — real hospital-staff session unavailable.

## TC-BILL-028 — Invoice detail charge grouping
GET /api/billing?id=<invoice> returns existing invoice line items; the UI groups them by operational charge category without changing financial totals.
Status: Implemented in v409; authenticated browser verification remains pending.

## TC-BILL-029 — Invoice payment history presentation
Invoice detail shows each recorded payment with date, amount, method, reference and receiver, plus outstanding balance.
Status: Implemented in v409; authenticated browser verification remains pending.

## TC-BILL-030 — Billing payment entry contract
Invoice detail submits incremental payment amounts through the existing PUT /api/billing contract; no UI-side total replacement is used.
Status: Implemented in v409; authenticated billing-staff execution remains pending.

## TC-INVENTORY-029 — Pharmacy transfer production gate
The deployed `/api/pharmacy-stock-transfers` state machine is live. On 2026-10-01, the owner-only `/api/pharmacy-stock-validation` returned 11/11 checks passing with 0 violations; the transfer route returned HTTP 401 without authentication and the available signed-in app-user path was rejected by `requireStaff()` with HTTP 401. A real hospital-staff session is unavailable, so authenticated issue/receive/cancel, role-boundary, invalid-transition and concurrency tests remain open.

## TC-BILL-031 — Invoice PDF action
Invoice detail exposes Print / PDF and opens the existing protected invoice PDF route for the selected invoice.
Status: Implemented in v410; authenticated browser verification remains pending.

## Billing completion gate
Billing is marked Complete only after authenticated invoice/payment E2E, role boundaries, invalid financial inputs, invoice continuity and workflow audit events pass.

## TC-THEATRE-001 — Theatre procedure worklist
The Theatre module exposes a read-oriented worklist with HMIS-aligned search across patient, UHID, admission/BHT, procedure, doctor and room, plus procedure-state and date filters. Patient identity remains linked to the existing Patient Workspace, and existing lifecycle/charge/ward-return actions remain mapped to their protected server transitions.
Status: Deployed in v417. Dry-run passed with 0 errors. Anonymous GET /api/theatre returns 401. Authenticated hospital-staff browser verification remains pending because the available runner cannot establish a real staff session.
## TC-THEATRE-020 — Room schedule
Room schedule groups existing scheduled/in-progress Theatre procedures by hospital-scoped theatre room and preserves procedure/patient context without adding a scheduling mutation.
Status: Implemented in the UI-10 full-loop increment; authenticated browser verification pending.

## TC-THEATRE-021 — Patient/procedure header
Opening a Theatre procedure shows patient/UHID/BHT, admission, procedure, doctor, room, lifecycle, schedule and outcome context and links to Patient Workspace.
Status: Implemented; authenticated browser verification pending.

## TC-THEATRE-022 — Surgical team
Opening a procedure shows existing surgical team assignments and only exposes the verified team_add/team_remove server actions for editable procedures.
Status: Implemented; authenticated role-boundary browser verification pending.

## TC-THEATRE-023 — Lifecycle controls
Theatre UI exposes only scheduled → in_progress → completed and scheduled → cancelled transitions; completion requires an outcome and server validation remains authoritative.
Status: Implemented; authenticated browser verification pending.

## TC-THEATRE-024 — Theatre charges
Procedure detail shows protected Theatre charges and existing billing/admin charge creation; financial linkage remains server-authorized.
Status: Implemented; authenticated billing execution pending.

## TC-THEATRE-025 — Ward return
Completed admission-linked procedures expose the protected ward_return action only when the procedure has not already been returned and retain admission/encounter continuity checks on the server.
Status: Implemented; authenticated browser verification pending.

## TC-THEATRE-026 — Validation/revert
Completed procedures can surface protected validation and validation-revert controls; validation requires invoice-linked Theatre charges and revert requires a non-empty reason.
Status: Implemented; authenticated role-boundary browser verification pending.

## TC-THEATRE-027 — Clinical/financial closure
Procedure detail combines lifecycle, outcome, Theatre charges, validation state and ward-return state in one closure presentation without inventing a new mutation.
Status: Implemented; authenticated browser verification pending.

## TC-THEATRE-028 — Full UI-10 loop access boundary
The Theatre UI remains backed by protected routes; anonymous GET /api/theatre, /api/theatre-charges, /api/theatre-validate and /api/theatre-validation-revert must not expose protected data or mutations.
Status: Deployed v421. Dry-run passed with 0 errors; anonymous GET access to /api/theatre, /api/theatre-charges, /api/theatre-validate and /api/theatre-validation-revert returned 401. Authenticated hospital-staff E2E remains pending.

## TC-IPD-020 — Discharge checklist cannot mutate a terminal admission
Route: /api/discharge; Method: POST/PUT; Actor: authenticated staff.
Expected: checklist creation/update is bound to an active admission lock. If discharge wins the race and sets discharged_at, a concurrent or already-started checklist mutation returns HTTP 409 and cannot modify the terminal admission's checklist.
Status: Implemented in v450; authenticated staff concurrency execution remains pending.
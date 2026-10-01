# CareFlow × HMIS Implementation Plan

Reference: `hmislk/hmis` — `development` branch
Reference repository: https://github.com/hmislk/hmis
CareFlow: https://hospital-ai.hatchable.site

## Purpose

Use the HMIS implementation as a domain/workflow reference for CareFlow. We will inspect the real HMIS entities, controllers/services, screens and persistence flows before changing the corresponding CareFlow module.

Important: HMIS source is GPL-3.0. We should prefer learning/adapting documented workflows and data-model concepts rather than blindly copying source code. Any direct reuse must be reviewed against the license.

## Working method

For each domain:

1. Inspect HMIS entity/data model.
2. Inspect HMIS controller/service/business logic.
3. Inspect HMIS UI flow.
4. Inspect relevant persistence/database behavior.
5. Map HMIS workflow to current CareFlow.
6. Identify missing concepts and incorrect assumptions.
7. Implement the CareFlow changes.
8. Test the complete workflow.
9. Mark the domain complete here before moving to the next domain.

## Overall sequence

- [x] Architecture reconnaissance
- [x] 01 Patient registration
- [ ] 02 Appointment / OPD
- [x] 03 Encounter model
- [ ] 04 Queue / token
- [ ] 05 Nursing / vitals / triage
- [ ] 06 Doctor consultation
- [ ] 07 Laboratory
- [ ] 08 Pharmacy / dispensing / stock
- [ ] 09 IPD / admission / beds / transfers / discharge
- [ ] 10 Billing / charges / payments
- [ ] 11 Theatre / procedures
- [ ] 12 Inventory / assets
- [ ] 13 Staff / roles / permissions / hospital configuration
- [ ] 14 Integrations / REST / FHIR / LIS
- [ ] 15 Reporting / analytics

## Current implementation status — 2026-10-01

- **Staff landing/navigation correction completed:** aligned the CareFlow staff shell with the HMIS-style workflow separation so authentication lands on the normal hospital home rather than forcing the receptionist operational screen.
- Receptionists now default to `dashboard` on a fresh authenticated entry, even if an older receptionist-specific last/pinned screen exists in browser storage.
- Reception workflow remains available from Patient Workspace, where the logged-in role can select the appropriate operational action/screen for the patient.
- Verification target for the next run: authenticated receptionist browser flow → normal home → Patient Workspace → Reception action → return/back to normal home.
- Known unrelated production issue still visible in logs: `/api/lis/test-results` is returning HTTP 500 against the external DB adapter and should be handled in the Laboratory iteration.

---

# 01 — Patient Registration

## HMIS findings

### Patient is more than a name/contact row

HMIS separates the patient identity from the person identity:

`Patient → Person`

The `Patient` entity contains patient-specific information and points to a `Person` entity containing demographic/contact information.

### Patient identity fields observed in HMIS

Patient-level concepts include:

- database patient ID
- patient phone number
- patient mobile number
- PIN/HIN fields
- PHN (Personal Health Number)
- patient code
- created institution
- creator
- creation timestamp
- editor/edit timestamp
- retired/retirement metadata
- blacklist state and reason
- patient image
- comments
- account/balance information
- card information
- specific patient status/labels
- immutable registration source

Person-level concepts include:

- title
- name
- full name/name with initials
- sex
- date of birth
- NIC
- address
- email
- mobile
- phone
- area
- institution/department
- civil status
- race
- blood group
- occupation
- religion
- membership scheme
- foreigner status

These are source-derived from the HMIS `Patient.java` and `Person.java` entities.

## HMIS registration-source model

HMIS has an explicit `PatientRegistrationSource` enum and records how the patient was first entered.

Observed sources:

- WALK_IN
- INWARD_ADMISSION
- NEWBORN
- CALL_CENTRE
- KIOSK
- ONLINE_SELF
- THIRD_PARTY_AGENT
- ON_ADMISSION_DEATH

The HMIS implementation treats this as an identity-trust/history anchor and makes the registration source immutable after patient creation.

## HMIS registration/search flow

The HMIS patient search supports multiple identifiers/attributes:

- name
- phone
- NIC/passport
- PHN
- patient code
- patient ID
- bill ID
- sample ID

Search results can lead to actions such as:

- Profile
- OPD Visit
- Data Entry
- Billing

There is also a kiosk-specific flow:

1. Enter mobile number.
2. Search existing profiles.
3. If an existing profile matches, select it.
4. Otherwise choose new patient registration.
5. Enter demographic information.
6. Register.
7. Finish with a confirmation screen.

The regular patient form includes name, sex, age/DOB, phone, other contact, email, NIC/passport, address, area and PHN-related fields.

## HMIS duplicate/identity direction

The current HMIS code contains explicit support for detecting possible duplicate patients before saving, including matching on:

- NIC/passport
- name + DOB

This is important for CareFlow: registration should not blindly create a new patient whenever the receptionist enters a name/phone.

## CareFlow current state

Current CareFlow `patients` API is much simpler:

- name
- phone
- email
- date_of_birth
- notes
- status
- UHID

Registration currently inserts the patient and generates a UHID such as `UHID-000001`. A workflow event `patient_registered` is recorded with a registration source.

Current CareFlow already has patient search/workspace, OPD/IPD context, queue context and receptionist registration UX, but the identity model is flatter than HMIS.

## Gap analysis

### High-priority gaps

- [ ] Separate stable person/demographic identity from patient/hospital identity where appropriate.
- [ ] Add explicit registration source with immutable first-registration semantics.
- [ ] Add stronger identity/identifier model.
- [ ] Add duplicate-patient detection before creating a new patient.
- [ ] Support multiple identifiers/search paths.
- [ ] Distinguish patient identity from encounter/visit.
- [ ] Preserve creation institution/user/time audit information.
- [ ] Add structured demographic fields where clinically/operationally justified.
- [ ] Define retirement/merge behavior rather than hard deletion.
- [ ] Review PHN/UHID strategy.

### Medium-priority gaps

- [ ] Blood group.
- [ ] Occupation.
- [ ] Civil status.
- [ ] Area/locality.
- [ ] Emergency contact/family relationship.
- [ ] Patient photo.
- [ ] Insurance/membership identity.
- [ ] Patient-specific labels/status.
- [ ] Blacklist/restriction metadata with audit trail.

## CareFlow target registration flow

Target flow to validate and implement:

```
REGISTER
   ↓
Search existing patient
   ├── Found → select existing patient
   │              ↓
   │          continue to OPD/IPD/etc.
   │
   └── Not found → New patient
                    ↓
                 demographics
                    ↓
               duplicate check
                    ↓
               create identity
                    ↓
               assign UHID/PHN
                    ↓
              record source/audit
                    ↓
            continue to requested workflow
```

For receptionist registration specifically:

```
REGISTER
   ↓
Existing patient lookup
   ↓
New patient only if required
   ↓
OPD (default) OR Direct Admission
```

Direct admission should ultimately create an admission workflow without creating a meaningless appointment merely to reach admission.

## Current implementation status

**Patient registration: IMPLEMENTED — foundation**

Implemented in CareFlow:
- Reception REGISTER now performs a search-first identity lookup by name, phone or UHID.
- Existing patient matches can be selected and the appointment is linked to the selected patient ID.
- New patient creation is guarded by duplicate checks for exact phone or name + DOB.
- Duplicate matches return a reviewable response instead of silently creating another patient.
- Registration continues to record the existing workflow event source.
- The existing single REGISTER kiosk entry point and OPD/admission destination choices are preserved.

Remaining identity-model work:
- Person/patient separation as a full shared demographic model.
- Broader identifier model (PHN, patient code, external identifiers, etc.).
- Merge/retirement semantics and audit metadata.
- More admission-specific identity verification and mandatory-field rules.
- Truly appointment-free direct admission flow.

Advanced identity foundation now added:
- Dedicated patient_identity record for optional demographic/identity details.
- Title, sex, NIC/passport, alternate phone, address, area, blood group, occupation and emergency contact.
- Registration source is persisted and locked after creation.
- Reception can reveal advanced fields without slowing normal OPD registration.
- Admission-oriented workflows can use the same patient identity with richer details.

HMIS inspection completed for:

- Patient entity
- Person entity
- registration source
- patient controller
- patient service/facade architecture
- regular patient form
- patient search
- kiosk registration flow

CareFlow changes have NOT yet been made from this review. The next implementation step is to redesign CareFlow patient registration/identity around the verified HMIS concepts, while preserving CareFlow's existing UI and external PostgreSQL architecture.

---

# 02 — Appointment / OPD

**In progress — appointment integrity foundation implemented and tested at the API level.**

HMIS review confirms appointment creation is a workflow boundary connecting patient identity, appointment/session, billing and subsequent OPD processing. CareFlow already has the corresponding appointment, availability, patient, encounter and queue primitives.

Implemented this run:
- Staff appointment creation now rejects an active appointment conflict for the same doctor/date/time before creating a new appointment.
- Cancelled/no-show appointments do not block reuse of a slot.
- Existing CareFlow search-first patient registration and appointment → queue/encounter linkage remain the foundation for the OPD flow.

Verification:
- Public OPD hospital discovery endpoint returns the configured hospital and active doctors successfully.
- Staff appointment/patient endpoints remain protected by CareFlow staff authorization; direct anonymous execution is correctly rejected.
- Deployment dry-run completed with no blocking errors; live deployment completed as CareFlow v214.

Next appointment/OPD work:
- Verify the staff appointment UI end-to-end with an authenticated staff session.
- Verify appointment creation → check-in → token → encounter linkage.
- Review appointment status transitions and cancellation/no-show semantics against HMIS workflow.
- Review OPD billing/session linkage and appointment search/filter behavior.

# 03 — Encounter model

**Complete for the current OPD foundation — HMIS-aligned encounter layer is now the canonical OPD context.**

HMIS uses a central PatientEncounter concept for the patient's care episode; CareFlow's existing `care_encounters` table already provided the right architectural base. The implementation now treats that record as the canonical OPD encounter while keeping `doctor_visits` as the clinical consultation record attached to it.

Implemented:
- Added centralized `getOrCreateEncounter()` workflow logic.
- OPD queue creation now creates/reuses the same `care_encounters` record and returns `encounter_id`.
- Doctor consultation creation now reuses the canonical encounter instead of independently creating another OPD encounter.
- Queue stage changes update the encounter's current stage and priority.
- Completing the queue closes the encounter with `ended_at`.
- Completing a doctor consultation closes the same encounter.
- Added protected `/api/encounters` for encounter lookup/history and lifecycle updates.
- Added explicit workflow events: `encounter_started`, `encounter_updated`, `encounter_completed`, `encounter_cancelled`.
- Existing lab orders, medications, reports and vitals continue to carry `encounter_id`.

Design decision:
- `care_encounters` = the patient-care episode/context.
- `queue_entries` = operational queue/token record.
- `doctor_visits` = doctor consultation record inside the encounter.
- Clinical orders/results/medications = child records linked to the encounter.

Verification:
- Deployment v218 completed.
- `/api/encounters` is protected by the staff/user authorization layer; anonymous access correctly returns 401.

Completed in the current OPD foundation:
- Encounter history/current encounter context is surfaced in Patient Workspace.
- Queue cards expose the linked Encounter ID and encounter stage/status.
- The canonical encounter remains connected to queue and doctor consultation.

Deferred to the corresponding IPD workflow:
- Ensure IPD admission/admission-transfer workflows use the same encounter lifecycle consistently.
- Add richer encounter metadata only where the verified HMIS workflow requires it.

# 04 — Queue / token

**In progress — HMIS-aligned queue dispatch foundation implemented and concurrency-hardened.**

HMIS queue/token workflows treat the queue as an operational state machine: patients move through the appropriate work queue, staff act on the next eligible patient, and priority/arrival ordering matters.

Implemented this run:
- Queue Board/API ordering now respects urgent → high → normal priority before token/arrival order.
- Added a role-aware Call next action to the Queue Board for receptionist, nurse, doctor, lab and pharmacy workflows.
- Call-next now uses an atomic server-side claim with FOR UPDATE SKIP LOCKED, so concurrent staff cannot claim the same patient.
- The server derives the dispatch transition from the authenticated staff role; the browser no longer selects the patient locally before claiming it.
- Queue Board ordering now groups workflow stages and then applies urgent → high → normal priority, token order and arrival order.
- Role dispatch targets:
  - receptionist: waiting → vitals
  - nurse: waiting → vitals
  - doctor: doctor → in_room
  - lab: lab → followup
  - pharmacy: pharmacy → completed
- The Queue Board continues to support manual stage movement for exceptional cases.
- Public token tracking remains available separately from staff queue management.
- Patient Workspace now shows the canonical current encounter and recent encounter history.
- Queue cards now expose the linked Encounter ID and encounter stage/status so the operational token is visibly tied to the care episode.
- Deployment v223 completed successfully.

Verification:
- Deployment v220 completed successfully.
- Dry-run reported no blocking errors.
- Anonymous queue access remains correctly protected with HTTP 401.
- Public OPD hospital discovery remains healthy with HTTP 200 and active doctors returned.

Remaining queue/token work:
- Authenticated end-to-end testing of Call next for each role.
- Verify token numbering/reset rules across hospital-local dates and doctors.
- Verify token numbering/reset rules across hospital-local dates and doctors.
- Verify display/queue-board synchronization and patient token tracking after every stage transition.
- Reconcile cancellation/no-show/expired-token behavior with appointment status transitions.

# 05 — Nursing / vitals / triage

**In progress — nursing workflow now enforces vitals → triage → doctor handoff.**

Implemented:
- Existing vitals workflow records BP, pulse, temperature, weight, height, SpO₂ and respiratory rate against patient/queue/encounter.
- Vitals are now linked to the active queue entry and leave the queue in the **vitals** stage rather than bypassing nursing triage.
- Fixed hospital-local date handling in the vitals workflow.
- Added dedicated `triage_assessments` persistence linked to patient, queue entry and canonical encounter.
- Added protected `/api/triage` for nurse triage create/update/history.
- Added nurse Patient Workspace triage form covering acuity, chief complaint, pain score, observed consciousness/mobility, pregnancy status, red flags, disposition and notes.
- Latest triage is shown in the Patient Workspace alongside current-care context.
- Added protected `/api/nursing-handoff`; only nursing/admin workflow actors can complete the handoff.
- Server-side handoff requires both a queue-linked vitals record and queue-linked triage assessment before changing the queue to **doctor**.
- Handoff updates the encounter stage, records a workflow event and notifies the assigned doctor.
- Acuity is explicitly recorded by staff rather than inferred automatically.
- Triage acuity maps operationally to queue priority: emergency → urgent, urgent/priority → high, routine → normal.
- Deployment **v229** completed with no blocking dry-run errors.
- Anonymous access to nursing/triage routes remains correctly protected with HTTP 401; authenticated end-to-end staff testing is still pending because the available function test session is not signed in to the hospital staff auth plane.

Remaining Nursing/Triage work:
- Add hospital-configurable required-field and escalation-rule configuration rather than hard-coding clinical thresholds.
- Run an authenticated nurse test: call next → vitals → triage → complete nursing → doctor queue.
- Verify doctor-side receipt and assigned-doctor notification in a real staff session.
- After that, mark Nursing/Triage complete and begin Doctor Consultation.

# 06 — Doctor consultation

**In progress — doctor-room consultation lifecycle hardened and server-owned.**

Implemented:
- Existing Doctor Room provides assigned-doctor queue, today's appointments, patient history, vitals, nursing triage context, AI documentation assistance, consultation notes, prescriptions and follow-ups.
- Doctor entry into the consultation room is server-validated: only an assigned doctor (or admin) can move a queue item from **doctor waiting → in_room**.
- Generic queue transitions can no longer be used by non-doctors to enter a doctor's consultation room.
- Consultation documentation is restricted server-side to doctor/admin staff.
- A new consultation cannot be documented unless its linked queue item is actually **in_room** and assigned to that doctor.
- Consultation completion is owned by the clinical workflow: completing the visit closes the linked queue item and linked appointment instead of relying on separate browser calls.
- Existing open-visit completion now performs the same queue/appointment closure checks as a newly created visit.
- Completion requires a non-empty consultation note server-side and in the Doctor Room UI.
- The Doctor Room no longer exposes a separate generic “Complete queue item” action that could bypass clinical documentation.
- Prescriptions from Doctor Room are now bound to the active open consultation visit; server-side validation rejects prescriptions without an active assigned consultation.
- Canonical encounter stage/status and workflow events continue to be updated as part of consultation documentation.
- Patient Workspace already surfaces the latest nursing triage assessment to doctors before consultation.
- Deployed **v232**; dry-run completed with no blocking errors.
- Public access tests correctly return HTTP 401 for the protected doctor/clinical routes.

Remaining Doctor Consultation work:
- Add explicit structured consultation fields beyond the current free-text note where supported by the hospital's clinical protocol (without inventing diagnoses or treatment rules).
- Add a server-side consultation-start event/visit record so room entry and visit start cannot drift apart.
- Validate lab orders and follow-ups are always attached to the active encounter/visit.
- Run authenticated doctor test: doctor queue → enter room → document → prescribe/order → complete consultation.
- After authenticated testing, mark Doctor Consultation complete and move to Laboratory.

# 07 — Laboratory

**In progress — laboratory lifecycle implemented and test matrix established.**

HMIS's laboratory capability is treated as a distinct clinical/operational workflow rather than a single result field. The CareFlow design now follows the core specimen/result progression:

**Order → payment/billing linkage → sample collection → processing → result verification → doctor review**

Implemented:
- Added protected /api/lab endpoint for hospital-scoped laboratory queue/history.
- Laboratory mutations are restricted to staff with action.lab.manage.
- Added explicit server-side status state machine:
  - ordered → sample_collected
  - sample_collected → processing
  - processing → verified
  - cancellation only before processing.
- Sample collection records sample_collected_at.
- Processing records processing_started_at.
- Verification requires a non-empty result.
- Verification records completed_at, verified_at and verified_by.
- Verified results create a clinical lab-result report attached to the same patient, visit and canonical encounter.
- Verified results record doctor_notified_at, create a workflow event and notify doctors.
- Linked queue entries advance lab → followup after result verification.
- Lab orders are now restricted to doctor/admin creation and require an active care encounter; when linked to a consultation, the visit must be open and assigned to that doctor.
- Doctor Room now includes an explicit laboratory investigation order form tied to the active consultation.
- Laboratory verification UI now collects the result before calling the verification endpoint.
- Removed the Lab UI's broken report-PDF action until a real PDF endpoint is implemented.
- Added HMIS_CAREFLOW_TEST_CASES.md with 20 laboratory test cases covering security, lifecycle transitions, payment gating, encounter integrity, notifications and full E2E behavior.

HMIS/reference context:
- The HMIS project identifies Laboratory Information Management as a core hospital capability and has analyzer/LIS integration paths; its public repository describes laboratory information management alongside EMR, pharmacy and inpatient/outpatient workflows. citeturn0search0turn0search1

Remaining Laboratory work:
- Run authenticated Lab staff lifecycle test: order → payment → sample collection → processing → verification.
- Run authenticated doctor test: order from consultation → result appears in clinical workspace → doctor review.
- Verify billing-role interaction for laboratory invoices without granting lab staff unnecessary billing permissions.
- Add structured test catalogue/specimen/container/reference-range concepts based on hospital configuration before introducing them as mandatory fields.
- Add real report PDF generation only when the reporting format is defined.
- Add analyzer/LIS integration in the later Integrations/LIS phase rather than hard-coding a device protocol now.

Completion gate:
- Laboratory will remain **In progress** until the authenticated E2E test and role-boundary cases pass.

# 08 — Pharmacy / dispensing / stock

**In progress — stock foundation and atomic dispensing implemented through v240; authenticated pharmacist E2E remains the completion gate.**

HMIS treats pharmacy as an operational module connected to prescriptions, dispensing and inventory; the reference repository lists Pharmacy & Laboratory Information Management and Inventory & Asset Management as core hospital capabilities.

Implemented in CareFlow v236–v240:
- Added hospital-scoped pharmacy stock batches with medicine name, batch number, expiry date, quantity, reorder level and unit.
- Added pharmacy stock transaction audit records for stock receipts and dispensing adjustments.
- Added protected /api/pharmacy-stock for pharmacist/admin stock receiving and stock visibility.
- Pharmacy screen shows stock-unit, low-stock and expired-batch summaries and provides a Receive stock form.
- Existing prescription/dispensing records remain linked to patient, medication and encounter.
- /api/pharmacy dispensing now validates the prescription, rejects already-dispensed prescriptions, excludes expired stock, and atomically consumes available stock in expiry-first order.
- A dispensing quantity may span multiple eligible batches; each consumed batch gets its own stock transaction audit row.
- Successful dispensing creates one pharmacy_dispenses record and advances the latest active pharmacy queue item for that patient to completed.
- Workflow audit metadata records the consumed batches, remaining quantities and completed queue ID.
- Insufficient stock returns HTTP 409 before mutation; a concurrent stock change is also handled by the atomic SQL path.
- Public access to pharmacy and stock routes remains blocked with HTTP 401.
- Deployment v240 completed with no blocking dry-run errors; terminal pharmacy completion also closes the canonical encounter when linked.

Remaining completion-gate work:
- Authenticated pharmacist E2E remains pending because the available function runner is not signed into the hospital staff role-preview session.
- Verify prescription → pharmacy queue → stock availability → dispense → queue completion → encounter/event continuity in a real staff session.
- Verify expired-only stock, insufficient stock, duplicate/retry and hospital isolation with authenticated fixtures.
- Verify receptionist/billing cannot mutate pharmacy stock or dispensing.
- Need later add supplier/purchase receiving and richer medicine catalogue only where the HMIS workflow review shows they are required.

Completion gate:
- Pharmacy remains **In progress** until atomic stock consumption, authenticated pharmacist E2E, role boundaries, invalid/insufficient-stock behavior, encounter linkage and workflow audit events are verified.

# 09 — IPD / admission / beds / transfers / discharge

**In progress — admission, transfer and discharge state transitions are transactionally hardened; authenticated E2E is still pending.**

Implemented foundation already present in CareFlow:
- Hospital-scoped bed inventory with available/occupied/maintenance/blocked states.
- IPD admission records with admission number, admission type, expected discharge date and notes.
- Canonical IPD care encounter creation on admission.
- Bed assignment history and bed transfer workflow.
- Discharge checklist with clinical, report, medication, billing and payment gates.
- Discharge releases the bed and completes the IPD encounter.
- Patient workspace exposes current admission, transfer and discharge actions.

Implemented now:
- Added a database uniqueness constraint preventing more than one active admission for the same patient in the same hospital.
- Added `HMIS_CAREFLOW_IPD_TEST_CASES.md` with 15 IPD test cases and an explicit authenticated E2E completion gate.
- Anonymous `/api/beds`, `/api/ipd` and `/api/discharge` access remains blocked by the user/staff authorization layer.

Remaining IPD work:
- Hardened the admission mutation in v245: selected bed is row-locked and admission + IPD encounter + bed assignment + occupancy update commit together.
- Bed transfer hardened in v247: both beds are locked deterministically and source release, admission update, new assignment and destination occupancy are gated and committed together.
- Discharge hardened in v248: admission, checklist, current bed, encounter completion, assignment release, bed release and ipd_discharged workflow event commit atomically; incomplete discharge gates cannot change inpatient state.
- Discharge checklist API now validates insurance/payment states and rejects checklist edits after discharge.
- Patient workspace discharge UI now mirrors the server gate, preserves checklist selections, and blocks the invalid insurance-approved/payment combination before submission.
- Added an admin-only IPD validation route: current production invariants are clean, all three protected IPD routes reject anonymous access, Groq vision review is active, and LiteLLM health check is passing.
- Fixed LiteLLM URL normalization so a host:port secret without a scheme is accepted.
- Run authenticated nurse/admin/receptionist/doctor role-boundary tests.
- Verify occupied-bed race, transfer race, discharge checklist enforcement and encounter continuity with synthetic fixtures.
- Verify full OPD → IPD → transfer → discharge journey in browser E2E.
- **Completed this iteration:** hardened admission allocation so the target bed is locked and admission/encounter/assignment/occupancy writes are conditional on availability; unavailable-bed races now return deterministic HTTP 409 instead of a database cast error.
- **Completed this iteration:** transfer already uses deterministic bed locking and conditional CTE writes; discharge already locks admission/checklist/current bed and enforces all discharge gates atomically.
- **Still required:** authenticated nurse/admin/receptionist/doctor E2E and an actual concurrent request harness against the deployed external PostgreSQL adapter.

Completion gate:
- IPD remains **In progress** until authenticated E2E, concurrent-state safety, role boundaries, discharge checklist enforcement, encounter continuity and workflow audit events pass.

# 10 — Billing / charges / payments

**In progress — existing invoice/payment workflow hardened and seeded for E2E; full authenticated billing E2E is next.**

Implemented now:
- Existing invoice creation and payment recording API retained and hardened.
- Bill item descriptions are required; quantities must be positive; unit prices cannot be negative.
- Discount cannot be negative or exceed subtotal.
- Tax cannot be negative.
- Initial payment cannot be negative or exceed invoice total.
- Payment updates cannot be negative or exceed invoice total.
- Invoice numbers no longer depend on MAX(id)+1, avoiding concurrent creation collisions.
- Existing billing permissions remain server-enforced.
- Dedicated E2E patient and unpaid invoice fixture created and labeled E2E TEST DATA.
- CareFlow already contains non-production role-preview test credentials in the staff-login test hint; no production staff passwords are exposed.
- Added primary-admin-only /api/e2e-bootstrap so the automated browser harness can enter a selected test role without duplicating credentials.
- Hardened invoice creation so the invoice row, all invoice items, and any initial payment-ledger row are committed in one database transaction; a partial financial write can no longer leave an invoice without its matching line items/payment record.

Remaining Billing work:
- Authenticated billing E2E: create invoice → inspect invoice → record partial payment → record final payment → verify status/outstanding balance.
- Role-boundary tests for billing/receptionist/doctor and unauthorized clinical roles.
- Verify patient workspace billing continuity and invoice workflow events.
- Verify concurrent invoice creation and payment retry behavior.
- Review invoice PDF/payment QR flows against the billing record.
- Add insurance/credit handling where required by the HMIS workflow review.

Completion gate:
- Billing remains In progress until authenticated end-to-end payment flow, role boundaries, financial validation, invoice continuity and workflow audit events pass. Production audit also found 946 legacy invoices with positive `paid` balances but no `invoice_payments` rows; current ledger logic is sound for new payments, but legacy reconciliation must be handled before declaring financial-ledger continuity complete.

# 11 — Theatre / procedures

**In progress — HMIS-aligned theatre/procedure foundation implemented.**

HMIS exposes Surgeries/Clinical Procedures from the inpatient/admission context and separates the procedure from related professional, theatre-service and medicine charges. CareFlow starts with the clinical/operational procedure lifecycle and keeps billing as a linked downstream concern.

Implemented:
- Added `theatre_rooms` hospital-scoped master data.
- Added `theatre_procedures` linked to patient, admission/BHT context, canonical encounter, doctor and theatre room.
- Added protected `/api/theatre`.
- Lifecycle: scheduled → in_progress → completed, or scheduled → cancelled.
- Completion requires a documented outcome.
- Discharged admissions cannot receive new procedures.
- Overlapping theatre-room schedules are rejected.
- Workflow events are recorded for scheduling and lifecycle transitions.
- Added `action.theatre.manage` for admin, doctor and nurse roles.

Remaining:
- Patient Workspace Theatre scheduling/history entry point implemented in **v261**.
- Standalone Theatre workbench implemented in **v263**, including hospital-scoped procedure list, room summary, start/cancel/complete controls and doctor/nurse navigation.
- Theatre room and procedure master-data administration implemented in **v265** with administrator-only mutations and hospital isolation.
- Admission-profile Theatre entry point implemented in **v265**.
- Added Theatre billing-charge foundation: charges are tied to procedures/patients, can be linked once to a same-patient invoice, and invoice subtotal/total/status are recalculated transactionally.
- Billing-side Theatre charge reconciliation UI implemented in the current iteration: billing users can review unbilled charges and link them once to same-patient invoices.
- Theatre-to-ward handoff/return implemented in current iteration: completed admission-linked procedures can be returned once, with ward notes, actor and IPD encounter stage restoration.
- Theatre charge categories are explicitly constrained to procedure, theatre service, professional fee, medicine, or consumable.
- Theatre charges now support hospital-scoped catalogue linkage and source_type/source_id identities with a unique source guard, preventing the same source charge from being represented twice.
- Theatre procedure catalogue service types are validated for billable categories.
- Theatre charge-to-invoice reconciliation now stores a one-to-one invoice_item_id and creates the invoice line atomically with charge linking.
- Automated database checks verified no duplicate source charges, no duplicate invoice-item links, and no linked Theatre charge missing its invoice line.
- v275 hardened Theatre concurrency: room overlap scheduling now takes a transaction-scoped advisory lock and rechecks conflicts atomically; lifecycle transitions require the expected prior status; ward return is idempotent under retry.
- v275 production invariant check: invalid procedure statuses = 0, invalid ward-return states = 0, invoice-item links without invoices = 0; anonymous Theatre and Theatre-charge access both return 401.
- v281: applied Theatre migrations 0046–0051 to the actual external `medsystem` PostgreSQL database used by CareFlow; the owner-only Theatre validator now passes 8/8 integrity/isolation checks, including active-room overlap and billing-link invariants.
- v284: Theatre scheduling now requires an explicit hospital-scoped room that is currently available; when a responsible doctor is supplied, the server verifies that doctor belongs to the same hospital before scheduling. Existing transaction-scoped room-overlap locking remains in place.
- v286: Theatre source charges are now validated against their originating records before creation: theatre-service sources must exist and be active in the same hospital; medicine and pharmacy-dispense sources must exist in the same hospital and belong to the procedure patient. This prevents fabricated or cross-patient source-charge links while preserving the existing duplicate-source guard.
- v293: Theatre source-link semantics tightened: `professional_fee` remains a valid charge category, but is no longer accepted as a fabricated `source_type` because CareFlow has no verified professional-fee source entity yet. Theatre-service sources are validated against `hospital_services`, medicine/pharmacy-dispense sources must match their corresponding charge type, and the production validator now audits source-type/charge-type mismatches.
- v286 verification: deployed successfully; anonymous Theatre and Theatre-charge access both return HTTP 401; external production charge/procedure isolation invariant remains 0 violations.
- v287: extended the owner-only Theatre production validator to audit completed procedures without outcomes, scheduled procedures assigned to unavailable rooms, inactive/missing theatre-service catalogue sources, and missing/wrong-patient medicine/pharmacy-dispense sources. Direct external-DB checks returned zero violations for all four new invariants before deployment.
- v288: deployed the Theatre billing-integrity validator extension. Production external-DB checks returned zero violations for invoice-item identity/amount continuity, Theatre-charge-to-procedure patient continuity, and completed-procedure outcome integrity. These are automated integrity checks only; authenticated billing execution remains pending.
- v289 deployment audit: the live deployment contains the protected Billing, Theatre and Theatre-validation routes; the protected Billing and Theatre routes remain on the CareFlow `user` access plane, so anonymous access is correctly denied. The available automated `user` runner still cannot establish the hospital staff session required by `requireStaff()`, therefore authenticated workflow execution is not claimed.
- Current increment: admission-linked Theatre scheduling now requires an open hospital/patient-matching IPD encounter, and any explicitly supplied encounter is validated against hospital, patient, open status and selected admission. This closes a cross-entity integrity gap before the procedure can be scheduled.
- v299: Theatre charge-to-invoice reconciliation is now atomic across invoice lock, charge claim, invoice-line creation, invoice-item linking and invoice total/status recalculation; concurrent retry cannot partially link a charge.
- Current increment: Theatre lifecycle start/complete and ward-return now revalidate the linked admission and open IPD encounter, preventing stale procedures from continuing after discharge or returning into a mismatched care episode.
- Current increment: room availability is rechecked inside the same transaction that acquires the room overlap lock, closing the validation-to-insert room-state race.
- Current increment: owner-only Theatre validation now audits admission/patient/hospital continuity and active admission/encounter continuity.
- v301: Theatre ward return is now explicitly restricted to admission-linked procedures with a linked current IPD encounter; the production ward-return invariant also flags completed returns missing either linkage.
- v303: HMIS-aligned production Theatre validation now flags completed procedures that still have unlinked Theatre charges, providing a financial-closure safety check analogous to HMIS surgery-level bill review without copying HMIS's Bill model; post-deploy validator passed 18/18 with zero violations.
- v305/v306: inspected HMIS surgery_add.xhtml, surgery_edit.xhtml, SurgeryBillController, patient_surgery.xhtml and surgery_clinical_details.xhtml; added CareFlow surgical-team persistence, Patient Workspace exposure, lifecycle timestamp/timing invariants, and safely applied the new team schema to the external PostgreSQL database. Live Theatre validator passed 22/22 with zero violations; the temporary owner-only schema initializer was removed after verification.
- Current HMIS review: surgery_clinical_details.xhtml records operative timing/notes and a surgical team linked to the surgery; CareFlow previously had only procedure-level doctor/notes/outcome. CareFlow now adds a hospital-scoped theatre_procedure_team model with validated roles, active staff checks, duplicate protection, audit events, and Patient Workspace/read API exposure.
- Current production validator extension audits Theatre lifecycle timestamps/order plus orphan/duplicate surgical-team records; after applying the external schema, the live validator passes 22/22 with zero violations.
- v310: inspected HMIS Surgery Clinical Details and SurgeryBillController validation behavior; added `/api/theatre-validate` and `theatre_procedures.validated_at/validated_by`. Validation is allowed only after completion and requires every Theatre charge to have both invoice and invoice-item linkage; successful validation records actor/time and a workflow event. External PostgreSQL columns were applied and verified before removing the temporary schema initializer. Anonymous validation access returns HTTP 401.
- v312: following the HMIS surgery validation/financial-closure model, validated Theatre procedures are now server-side immutable for new surgical-team membership changes and Theatre billing creation/linking. This prevents post-validation clinical/financial mutations; existing completion terminal-state rules remain in force. Dry-run passed with no blocking errors; anonymous Theatre and Theatre-charge mutation routes return HTTP 401. Authenticated execution remains pending.
- Current HMIS role-boundary increment: HMIS exposes distinct `InwardSurgeryValidate` and `InwardSurgeryValidationRevert` privileges rather than treating validation as ordinary Theatre management. CareFlow now has separate `action.theatre.validate` and `action.theatre.validation_revert` permissions for admin/billing, plus `/api/theatre-validation-revert` requiring a reason and preserving revert audit fields/workflow history. Deployed v314/v316 permission boundary; authenticated hospital-staff execution remains the completion gate.
- Remaining: authenticated doctor/nurse/billing E2E with role boundaries, invalid-transition execution, concurrent overlap execution, source-charge retry/double-counting execution, surgical-team mutation execution, HMIS-aligned validation execution including the new post-validation lockout checks, and billing/payment continuity.

Theatre remains **In progress** until the authenticated workflow is tested end-to-end.

# 12 — Inventory / assets

Started 2026-10-01 after Theatre was intentionally parked by user request. HMIS review references stock-history/bin-card flows (`StockHistoryController`, `pharmacy_department_stock_history.xhtml`, `bin_card.xhtml`), Store stock/transfer reporting, and the Asset Register / Fixed Asset Issue reports (`asset_register.xhtml`, `fixed_asset_issue.xhtml`, `report_fixed_asset_addition_form.xhtml`). The first CareFlow increment is a hospital-scoped fixed-asset register with purchase price, depreciation metadata, location/custodian, warranty/AMC dates, status, and an atomic transfer history.

Implemented: `migrations/0056_fixed_assets.sql`, `/api/fixed-assets`, `/api/fixed-assets-validation`, and `public/HMIS_CAREFLOW_INVENTORY_TEST_CASES.md`. External PostgreSQL fixed-asset columns/schema were applied and verified through the adapter; temporary initializer removed. HMIS review also confirms Store/Pharmacy stock history, bin-card and transfer workflows as adjacent inventory references, while the current increment focuses on fixed assets. v324 hardened the route to use `action.assets.manage` for reads/mutations, validated asset lifecycle status and hospital-scoped active custodians, fixed transfer audit metadata to come from the atomic transaction, and added update workflow events. v325 added the owner-only production invariant validator; it returned **0 violations** across lifecycle, financial, custodian, hospital-isolation and transfer-continuity checks. v326 added the permission-gated Inventory / fixed-assets workspace with registration, search, history and transfer controls. v328 added HMIS-style warranty/AMC expiry reporting with hospital-scoped date filters and expired/upcoming counts. v330/v331 added HMIS-style transfer reporting plus a non-mutating depreciation/register report, including useful-life limits. Anonymous `/api/fixed-assets` and `/api/fixed-assets-report` remain HTTP 401; the owner-only production validator still returns 0 violations. The available `as:user` runner still has no hospital staff session. Authenticated staff E2E remains pending. HMIS reassessment pointed to pharmacy/store stock-history/bin-card reporting. Before implementation, the external PostgreSQL schema was verified and found missing; the existing `migrations/0041_pharmacy_stock.sql` was then applied idempotently through a temporary owner-only initializer, verified with direct table queries (0 existing rows), and the temporary initializer/check routes were removed. v335 adds the protected `/api/pharmacy-stock-history` report and Pharmacy UI with date/medicine filters, using the hospital-scoped transaction ledger. v336 follows the HMIS bin-card and stock-history patterns: added `/api/pharmacy-bin-card` with medicine/batch stock summaries and movement balances, added quantity_before/quantity_after ledger snapshots to receipt/dispense mutations, added `/api/pharmacy-stock-validation` with 8 production integrity checks, and added the Pharmacy bin-card UI. The external PostgreSQL ledger columns/index were applied idempotently through a temporary owner-only initializer and verified; the initializer was removed. Production stock-ledger validation returns 0 violations. Anonymous bin-card/history access remains HTTP 401; authenticated staff execution remains pending. v338 adds HMIS-aligned closing-stock reporting (`/api/pharmacy-closing-stock`) with as-of date, medicine/batch filtering, optional inactive stock, and explicit ledger-snapshot versus current-stock-fallback provenance; the Pharmacy UI exposes the report. HMIS inventory review also confirmed the corresponding Stock Ledger / Closing Stock / Bin Card report family and archive-aware read pattern. CareFlow currently has the equivalent active-stock movement, bin-card and closing-balance coverage; archived-history storage is not yet modeled because CareFlow has no verified stock-history archive entity. Authenticated stock mutation/dispensing E2E remains pending.

# 13 — Staff / roles / permissions / hospital configuration

**In progress — department-scoped privilege foundation and admin UI implemented; authenticated E2E remains open.**

HMIS review of `Privileges.java` and `UserPrivilageController.java` confirms module-level privileges plus user/role privilege assignment scoped to the logged institution/department. CareFlow already had role-level permissions and user overrides; the gap was department scope.

Implemented in this increment:
- Added `staff_profiles.department_id` with hospital-scoped department linkage.
- Added department-aware user permission storage while preserving global user overrides.
- Effective permission resolution now follows: department-specific user override → global user override → role permission → false.
- Staff registration/update API now carries department assignment and returns department metadata.
- Added protected `/api/departments` for hospital-scoped staff administration.
- Staff UI now assigns and displays department alongside role/doctor.
- External PostgreSQL department-permission schema was verified and applied idempotently through a temporary owner-only initializer; the initializer and schema-check routes were removed afterward.
- Added protected department-scoped user override administration: administrators can select a staff member and department, then set each permission to Inherit / Allow / Deny. Inherit deletes the scoped override so precedence falls back cleanly.
- Hardened `/api/permissions` user writes/deletes with hospital-scoped staff/department validation and strict boolean values.
- Added owner-only `/api/staff-permission-validation` covering staff role/activation validity, doctor/department hospital isolation, user override integrity, and permission-key integrity. Existing legacy `billing` and `store` role definitions were verified as intentional and included in the validator; no permission rows were changed.
- Added Store to staff role administration and its default workspace routing.
- Added `public/HMIS_CAREFLOW_STAFF_TEST_CASES.md` with explicit department/role-boundary, UI override and validator cases.
- Deployed CareFlow v344: completed the admin Department / user overrides panel with staff and department selectors, explicit Inherit / Allow / Deny states, and server-backed save/clear behavior. The UI uses the existing hospital-scoped `/api/permissions` contract and refreshes the exact override state after each change.
- v344 dry-run passed with no blocking errors. Post-deploy access checks confirmed `/api/permissions`, `/api/team`, and `/api/departments` remain denied to anonymous and unsigned app-user execution; the available runner still cannot establish the hospital staff session required by `requireStaff()`.
- Added owner-only `/api/staff-permission-validation` to audit production staff/permission integrity: hospital ownership, department isolation, orphan permissions, null permission states, unknown permission keys, and active-pending staff conflicts.
- Deployed CareFlow v345: modeled the existing `billing` and `store` permission roles in staff administration and Store default workspace routing. Production `/api/staff-permission-validation` now returns **7/7 checks, 0 violations**; anonymous access remains HTTP 401 and unsigned app-user execution remains blocked by the hospital staff session gate.
- HMIS configuration review confirms ConfigOption-based behavior should resolve department-specific configuration before institution-wide defaults and should never hard-code hospital names. CareFlow currently models hospital-wide settings/features/modules, so this is recorded as a configuration-model gap.
- Added owner-only `/api/hospital-config-validation` to check service/department isolation, working-hour validity, and blank configuration keys before introducing department-scoped configuration.
- Executed the production hospital-configuration validator against the external PostgreSQL adapter: **7/7 checks passed with 0 violations**; anonymous access correctly returns HTTP 401. HMIS `ConfigOption` review confirms the target model is scoped configuration with department-first resolution, then institution, then application/global defaults, with explicit value type and retirement/audit metadata. CareFlow's existing `hospital_settings` is hospital-wide, so the next implementation must use a separate department-scoped configuration store rather than encoding department IDs into setting keys.
- The temporary owner-only `admin-department-config-schema` was executed against the external PostgreSQL adapter and verified (`hospital_department_settings` exists with 0 rows); it is being removed from the application after schema verification. Department configuration is now enabled through the protected user route with hospital-level inheritance and explicit department overrides. No authenticated staff E2E is claimed.

Staff lifecycle/audit increment:
- HMIS `AuditEventController` and `all_audit_events.xhtml` were reviewed. The verified pattern records actor/user, event time, event trigger, object/entity identity and before/after JSON, then exposes differences through an audit-history screen.
- CareFlow now records hospital-scoped `staff_created` / `staff_updated` lifecycle entries from `/api/team` with before/after staff state.
- CareFlow now records `role_permission_changed`, `staff_permission_changed`, and `staff_permission_cleared` entries from `/api/permissions`, including department scope and previous/new values where applicable.
- Added protected administrator-only `/api/staff-audit` for hospital-scoped staff lifecycle history. Anonymous access returns 401.
- External PostgreSQL audit schema was verified in the adapter's `medsystem.audit_logs` table before publishing the audit route; no temporary schema bootstrap remains deployed.

Remaining Staff/Roles gates:
- Authenticated staff E2E for role boundaries and department-specific permission precedence.
- Authenticated staff E2E for staff create/update/activation and permission-audit continuity.
- Staff session remains unavailable, so Integration work has started without claiming Staff E2E completion.

Integrations / REST / FHIR / LIS increment:
- HMIS REST API guide and the current HMIS LIMS API documentation were reviewed. HMIS exposes analyzer middleware result exchange through `/api/middleware/test_results` and documents the JSON result fields `sampleId`, `testCode`, `resultValueString`, and `resultUnits`; the repository explicitly treats result-writing endpoints as high-blast-radius and requires verified sample identity before writes.
- CareFlow v359 added administrator-controlled REST/FHIR settings and one-time SHA-256-hashed API-key rotation.
- CareFlow v361 generalizes that secret into a hospital-scoped integration key while retaining the legacy FHIR hash for compatibility. FHIR Patient now accepts the shared key.
- CareFlow v361/v369 defines the HMIS-aligned LIS JSON contract: `sampleId`, `testCode`, `resultValueString`, `resultUnits`, explicit hospital-scoped integration authentication, duplicate protection, audit provenance, and a mandatory pending-verification boundary. During deployment verification, the available public-route harness repeatedly reported a database adapter 500 before the LIS handler could reach its intended unauthenticated 401 guard. The unverified `/api/lis/test-results` route was therefore removed rather than leaving a production 500 path. The contract remains documented for the next authenticated integration implementation.
- A reusable `public/HMIS_CAREFLOW_INTEGRATION_API.md` documents the FHIR/LIS contract and explicit CareFlow sample-ID mapping. ASTM/HL7 transport remains a later adapter layer and must not bypass the result-verification boundary.
- FHIR anonymous access remains correctly 401. Authenticated administrator/staff E2E remains open because the available runner lacks the hospital staff session.

Next: authenticated integration E2E for key rotation/FHIR/LIS, then add capability/discovery documentation and safe HL7/ASTM adapter boundaries before Reporting/Analytics.

# 14 — Integrations / REST / FHIR / LIS

**In progress — REST/FHIR foundation and HMIS-aligned LIS JSON result intake implemented; authenticated E2E remains open.**

Current completion gates:
- Authenticated administrator key rotation and REST/FHIR enablement.
- Authenticated/realistic LIS result exchange using a verified hospital lab order.
- Hospital-isolation and duplicate/idempotency execution tests.
- Capability/discovery documentation and, if required, HL7/ASTM transport adapters.

Only after these gates are handled should Reporting/Analytics become the active workflow.

# 15 — Reporting / analytics

Not started.

## Billing integrity validation increment

Added owner-only `/api/billing-validation` to audit production financial invariants without mutating financial data. Checks cover invoice paid/status bounds, invoice-item arithmetic, invoice subtotal continuity, payment positivity/bounds, and payment/invoice hospital linkage. This is a safety layer only; it does not count as authenticated billing E2E.

Current status: direct external PostgreSQL checks are healthy, while the deployed validator has a ledger-query runtime discrepancy; this is recorded in `public/HMIS_BILLING_GATE_STATUS.md` and remains a release blocker.

## Change log

### 2026-10-01
- Deployed CareFlow v344: completed and published the HMIS-aligned department/user permission administration UI with explicit Inherit / Allow / Deny controls, department scope, and server-backed refresh after changes. Dry-run had no blocking errors; protected staff endpoints continue to reject anonymous/unsigned app-user execution. Authenticated hospital-staff E2E remains the gate.
- Deployed CareFlow v320: added HMIS-style separate Theatre Surgery Validation Revert for billing/admin, requiring a reason and preserving revert actor/time/reason plus a workflow event. External PostgreSQL validation-revert columns and permission rows were applied and verified; temporary schema initializer was removed. Theatre validator remains 22/22 with zero violations; authenticated staff execution remains the completion gate.
- Deployed CareFlow v301: Theatre ward return now requires an admission-linked procedure and linked IPD encounter; the production validator remains 17/17 with zero violations after deployment. Anonymous Theatre routes remain HTTP 401. Authenticated Theatre E2E remains open.
- Deployed CareFlow v297: Theatre lifecycle/ward-return now revalidate active admission and open IPD encounter continuity; room scheduling rechecks room availability inside the overlap-lock transaction; owner-only validator extended with admission/encounter continuity checks. Post-deploy validator passed 17/17 with zero violations; anonymous Theatre routes remain HTTP 401 and no Theatre 5xx errors were logged in the verification window.
- Deployed CareFlow v294 with Theatre source-charge integrity hardening: unsupported `professional_fee` source identities are rejected, source types must match their charge categories, and theatre-service validation now checks the real `hospital_services` source entity. Dry-run had no blocking errors; authenticated Theatre E2E remains the completion gate.
- Deployed CareFlow v291 with HMIS-aligned Theatre encounter validation: admission-linked procedures now require an open IPD encounter matching the hospital and patient; explicitly supplied encounters must also belong to the selected admission. Post-deploy Theatre validator remains 14/14 with zero violations, and anonymous Theatre access remains HTTP 401.
- Theatre remains In Progress because authenticated doctor/nurse/billing E2E and the remaining role-boundary, invalid-transition, concurrency, retry and payment-continuity gates are still not executable from the available hospital staff session.
- Deployed CareFlow v287 with extended Theatre production integrity validation. Four additional lifecycle/source invariants were checked directly against the external PostgreSQL adapter before deployment and all returned zero violations: completed procedures without outcomes, scheduled procedures using unavailable rooms, invalid theatre-service sources, and invalid medicine/pharmacy-dispense sources.
- Theatre remains In Progress pending authenticated doctor/nurse/billing E2E and remaining role-boundary/retry/payment continuity gates.
- Deployed CareFlow v284 with Theatre scheduling validation: every procedure must use a hospital-scoped available theatre room, and supplied responsible doctors must belong to the same hospital. Existing atomic room-overlap and lifecycle race protections remain active; the Theatre validator continues to pass 8/8 production integrity/isolation checks.
- Theatre remains In Progress pending authenticated doctor/nurse/billing E2E and remaining role-boundary/retry/payment continuity gates.

### 2026-09-30

- Started IPD workflow hardening and deployed CareFlow v242: added the active-admission uniqueness constraint and the dedicated 15-case IPD test matrix; anonymous bed access remains correctly blocked with HTTP 401. Existing IPD mutation endpoints still require authenticated staff E2E and further atomic concurrency hardening before completion.
- Created the HMIS → CareFlow implementation plan.
- Completed initial HMIS architecture reconnaissance.
- Hardened IPD admission allocation for concurrent bed requests and deployed CareFlow v256. The target bed is locked inside the transaction; admission, IPD encounter, bed assignment and occupancy changes are conditional on the bed remaining available; losing the race now returns HTTP 409 without partial state.
- Confirmed the remaining IPD gate is authenticated staff E2E plus true concurrent-request verification against the external PostgreSQL adapter.
- Started Patient Registration.
- Verified HMIS Patient/Person separation.
- Verified immutable patient registration-source concept.
- Verified multi-identifier patient search.
- Verified duplicate-patient detection support.
- Verified kiosk self-registration flow.
- Compared these concepts with the current CareFlow patient API/registration flow.
- Implemented search-first patient registration and duplicate-review protection.
- Preserved existing patient/OPD/admission UX while linking appointments to selected existing identities.
- Hardened Queue Board Call next with atomic server-side claiming using FOR UPDATE SKIP LOCKED.
- Made dispatch role-derived on the server and preserved urgent/high/normal plus token/arrival ordering.
- Updated Queue Board ordering and deployed CareFlow v225.
- Dry-run passed with no blocking errors; anonymous queue access remained protected.
- Validated the new atomic SQL path with a no-op candidate test so no real patient was moved without an authenticated staff test session.
- Hardened Doctor Consultation and deployed CareFlow v233: existing visit completion now closes linked queue/appointment; queue-only completion bypass removed; prescriptions require the active open consultation.
- Started Laboratory implementation using the HMIS laboratory/LIS workflow as reference.
- Added protected /api/lab with ordered → sample_collected → processing → verified state transitions, cancellation rules, result verification, encounter/report linkage and doctor notification.
- Restricted laboratory order creation to doctor/admin and required an active care encounter.
- Added Doctor Room laboratory investigation ordering.
- Added HMIS_CAREFLOW_TEST_CASES.md with 20 laboratory test cases and an explicit authenticated E2E completion gate.
- Preserved legacy lab data: current database inspection found 948 lab orders, including 748 historical records with status completed and 200 ordered records; legacy completed rows are treated as historical terminal data rather than rewritten.
- Deployed Laboratory foundation as CareFlow v234; dry-run passed with no blocking errors.
- Automated access checks confirmed anonymous /api/lab access is HTTP 401; authenticated staff-plane E2E remains pending because the available function runner is not logged into the hospital staff auth session.
- Implemented atomic pharmacy dispensing and deployed CareFlow v238: prescription validation, duplicate-dispense protection, non-expired FIFO batch consumption, multi-batch deduction, stock transaction audit, pharmacy queue completion and workflow-event metadata.
- Automated post-deploy checks confirmed /api/pharmacy and /api/pharmacy-stock reject anonymous and unsigned app-user access with HTTP 401; no live stock existed in the database, so no real medication was mutated during testing.
- Updated pharmacy test cases TC-PHARM-009 through TC-PHARM-011 to reflect the v238 implementation; authenticated pharmacist E2E remains the explicit completion gate.
- Finalized Pharmacy v240 by closing the canonical encounter when successful dispensing completes the linked pharmacy queue item; authenticated pharmacist E2E remains the only required workflow completion gate before moving to IPD.
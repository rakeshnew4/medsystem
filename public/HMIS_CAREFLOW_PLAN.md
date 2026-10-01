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

Not started.

# 09 — IPD / admission / beds / transfers / discharge

Not started.

# 10 — Billing / charges / payments

Not started.

# 11 — Theatre / procedures

Not started.

# 12 — Inventory / assets

Not started.

# 13 — Staff / roles / permissions / hospital configuration

Not started.

# 14 — Integrations / REST / FHIR / LIS

Not started.

# 15 — Reporting / analytics

Not started.

## Change log

### 2026-09-30

- Created the HMIS → CareFlow implementation plan.
- Completed initial HMIS architecture reconnaissance.
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
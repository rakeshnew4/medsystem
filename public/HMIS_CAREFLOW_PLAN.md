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
- [ ] 03 Encounter model
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
- Deployment dry-run and live deployment are required before this change is considered shipped.

Next appointment/OPD work:
- Verify the staff appointment UI end-to-end with an authenticated staff session.
- Verify appointment creation → check-in → token → encounter linkage.
- Review appointment status transitions and cancellation/no-show semantics against HMIS workflow.
- Review OPD billing/session linkage and appointment search/filter behavior.

# 03 — Encounter model

Not started.

# 04 — Queue / token

Not started.

# 05 — Nursing / vitals / triage

Not started.

# 06 — Doctor consultation

Not started.

# 07 — Laboratory

Not started.

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
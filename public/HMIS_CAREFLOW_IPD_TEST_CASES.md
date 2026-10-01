# IPD / admission / beds / transfers / discharge

## TC-IPD-001 — Public bed access is blocked
Route: /api/beds; Method: GET; Actor: Anonymous.
Expected: HTTP 401.
Status: Automated.

## TC-IPD-002 — Public admission access is blocked
Route: /api/ipd; Method: GET; Actor: Anonymous.
Expected: HTTP 401.
Status: Automated.

## TC-IPD-003 — Public discharge access is blocked
Route: /api/discharge; Method: GET; Actor: Anonymous.
Expected: HTTP 401.
Status: Automated.

## TC-IPD-004 — Bed inventory is hospital scoped
Actor: authenticated nurse/admin.
Expected: only beds belonging to the active hospital are returned.
Status: Requires authenticated staff session.

## TC-IPD-005 — Admit patient to available bed
Scenario: registered patient + available bed.
Expected: admission, IPD encounter and bed assignment are created; bed becomes occupied; ipd_admitted event is recorded.
Status: Requires authenticated staff session. Admission mutation is now transactional and locks the selected bed before committing dependent records.

## TC-IPD-006 — Cannot admit into occupied bed
Expected: HTTP 409; existing occupant and admission remain unchanged.
Status: Requires authenticated staff session.

## TC-IPD-007 — Cannot create two active admissions for one patient
Expected: HTTP 409; one active admission remains. A database uniqueness constraint now enforces this invariant.
Status: Constraint implemented; authenticated execution pending.

## TC-IPD-008 — Edit active admission
Expected: expected discharge date/type/notes update without changing bed assignment or encounter identity.
Status: Requires authenticated staff session.

## TC-IPD-009 — Transfer bed
Expected: old assignment is released, new available bed becomes occupied, admission points to new bed, new assignment is recorded and bed_transferred event is emitted.
Status: Requires authenticated staff session. The transfer is now one transactional CTE with deterministic bed locking.

## TC-IPD-010 — Transfer to unavailable bed is rejected
Expected: HTTP 409 and no change to current bed assignment.
Status: Requires authenticated staff session. Availability is checked while the destination bed is locked, before any source-bed release.

## TC-IPD-011 — Discharge checklist blocks incomplete discharge
Expected: patient cannot be discharged until clinical clearance, reports, medication reconciliation, billing clearance and final payment/approval are satisfied.
Status: Requires authenticated staff session.

## TC-IPD-012 — Successful discharge releases bed
Expected: admission becomes discharged, IPD encounter completes, active bed assignment is released, bed becomes available, discharge event is recorded.
Status: Requires authenticated staff session. Discharge state transition is now atomic and inserts the discharge workflow event in the same transaction.

## TC-IPD-013 — Discharge cannot bypass checklist
Scenario: active admission with an incomplete/missing discharge checklist.
Expected: HTTP 409; admission remains active, encounter remains open, assignment remains active and bed remains occupied.
Status: Server-side gate implemented; authenticated execution pending.

## TC-IPD-014 — Discharged patient can be admitted again
Expected: a new admission/encounter can be created after the previous admission has discharged; history remains intact.
Status: Requires authenticated staff session.

## TC-IPD-015 — Encounter continuity
Expected: admission → IPD encounter → bed assignment/transfer → discharge retain the same canonical admission/encounter relationship.
Status: Requires authenticated E2E.

## TC-IPD-016 — Full OPD to IPD journey
Scenario: registration → OPD assessment → admission decision → bed allocation → IPD care → bed transfer → discharge checklist → payment clearance → discharge.
Expected: no orphan admission, encounter, bed assignment or bed occupancy state.
Status: Full authenticated E2E gate.

## TC-IPD-017 — IPD automated invariant/security validator
Route: /api/ipd-validation; Actor: project admin test runner.
Expected: active admissions have no duplicates; occupied beds have valid active admissions; active admissions have current assignments; discharged admissions do not leave beds occupied; /api/beds, /api/ipd and /api/discharge remain HTTP 401 anonymously.
Status: Automated and passing in v253.

## TC-IPD-018 — AI/UI infrastructure validation
Expected: Groq vision review executes against the public UI; LiteLLM health check succeeds; AI keys are never returned to the client.
Status: Automated and passing in v253. The visual review intentionally uses the public login surface because an authenticated hospital staff browser session is not available to the validator.

## IPD completion gate
IPD remains In progress until authenticated admission/transfer/discharge E2E, role boundaries, concurrent-bed safety, discharge checklist enforcement, encounter continuity and workflow events are verified.

### Automated protection now implemented
- `/api/beds`, `/api/ipd`, and `/api/discharge` reject anonymous access with HTTP 401.
- Discharge now locks the active admission, checklist and current bed in one transaction.
- Discharge requires clinical clearance, reports ready, medication reconciliation, billing clearance and either final payment (`paid`) or explicit insurance approval (`approved` + `insurance_status=approved`).
- Admission, encounter completion, assignment release, bed release and `ipd_discharged` workflow event commit together; a failed readiness gate leaves the inpatient state unchanged.
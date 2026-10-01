# HMIS × CareFlow Integrations / REST / FHIR / LIS Test Cases

Reference: HMIS REST API development guide and HMIS FHIR/REST interoperability documentation.

- TC-INT-001: Administrator can inspect integration state for the current hospital.
- TC-INT-002: Administrator can enable/disable REST and FHIR integrations.
- TC-INT-003: FHIR API key rotation returns a new key once and stores only its SHA-256 hash.
- TC-INT-004: FHIR Patient endpoint rejects requests without a Bearer API key with FHIR OperationOutcome/401.
- TC-INT-005: FHIR Patient endpoint rejects invalid keys with FHIR OperationOutcome/401.
- TC-INT-006: FHIR Patient endpoint is disabled unless hospital FHIR integration is enabled.
- TC-INT-007: Patient read is hospital-isolated by the API-key hospital scope.
- TC-INT-008: Patient search supports identifier (UHID) and name and returns a FHIR Bundle/searchset.
- TC-INT-009: Patient resource maps CareFlow UHID, name, telecom, DOB and active state into FHIR Patient.
- TC-INT-010: Authenticated administrator E2E must verify integration settings and key rotation before the integration gate is complete.
- TC-INT-011: LIS integration must preserve hospital, patient and encounter identity and support explicit result/status provenance before implementation is marked complete.
- TC-INT-012: LIS result endpoint rejects missing/invalid X-CareFlow-Integration-Key values with 401.
- TC-INT-013: LIS result endpoint rejects writes while REST integration is disabled.
- TC-INT-014: HMIS-shaped resultsRecords payload maps sampleId to a hospital-scoped CareFlow lab_order and requires sample_collected/processing lifecycle.
- TC-INT-015: LIS testCode must match the CareFlow ordered test_name before result mutation.
- TC-INT-016: Received LIS results remain pending clinical verification; the endpoint must not auto-verify or close the lab workflow.
- TC-INT-017: LIS result audit records preserve patient_id, encounter_id, order_id, testCode, units and external result identity.
- TC-INT-018: Duplicate LIS submissions return Duplicate without applying a second result mutation.
- TC-INT-019: Hospital isolation prevents an integration key from writing to another hospital's lab order.
- TC-INT-020: Authenticated administrator E2E verifies integration-key rotation, REST/FHIR enablement and real LIS result exchange before the integration gate is complete.
- TC-INT-021: Capability/discovery documentation must describe FHIR Patient and LIS JSON endpoints without exposing secrets.
- TC-INT-022: Any future HL7/ASTM adapter must terminate at the same validated LIS result boundary and preserve provenance.

Current implementation gate: HMIS REST and LIMS middleware references were reviewed. CareFlow v361 implements a shared hospital-scoped hashed integration key, hospital-scoped FHIR Patient read/search, and HMIS-compatible LIS JSON result intake with lifecycle validation, duplicate protection and audit provenance. Anonymous LIS/FHIR requests are expected to return 401. Authenticated administrator/staff E2E remains open; no clinical result write has been simulated without a verified hospital staff/lab session.
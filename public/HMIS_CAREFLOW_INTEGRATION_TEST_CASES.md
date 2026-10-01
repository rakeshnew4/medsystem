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

Current implementation gate: HMIS REST API conventions were reviewed. CareFlow v359 implements administrator-controlled REST/FHIR integration settings and a hospital-scoped /api/fhir/Patient read/search endpoint using Bearer API keys. No FHIR key is exposed or logged by the endpoint. Anonymous requests currently return 401. Authenticated administrator E2E and LIS workflow integration remain open.
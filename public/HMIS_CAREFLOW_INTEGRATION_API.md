# CareFlow Integration API

Reference: HMIS LIMS REST API and HMIS REST API development patterns.

## Authentication

Administrator integration settings generate one-time Bearer integration keys. CareFlow stores only a SHA-256 hash. The same integration key may be used for FHIR Patient and LIS result interoperability.

Send:

    Authorization: Bearer <integration-key>

Never place keys in URLs, source code, browser logs, or test fixtures.

## REST / integration controls

Administrators control REST and FHIR enablement through the CareFlow integration settings. LIS result ingestion requires REST integration to be enabled for the hospital.

## LIS result ingestion

POST /api/lis/test-results

The endpoint follows the verified HMIS middleware result shape. LIS clients authenticate with the dedicated X-CareFlow-Integration-Key header so platform Authorization/session headers cannot be confused with the hospital integration credential.

    {
      "resultsRecords": [
        {
          "sampleId": "123",
          "testCode": "CBC",
          "resultValueString": "13.5",
          "resultUnits": "g/dL",
          "resultId": "analyzer-result-123"
        }
      ]
    }

For CareFlow, sampleId is the numeric CareFlow lab_orders.id. This explicit mapping avoids introducing a second sample identity until the laboratory sample entity is modeled.

Rules:
- Hospital scope is derived from the API key, never from request input.
- REST integration must be enabled.
- The referenced lab order must belong to the key's hospital.
- The order must already be in sample_collected or processing.
- testCode must match the ordered test_name case-insensitively.
- Results are received into result_summary but remain pending verification; the existing laboratory verification workflow remains the clinical sign-off boundary.
- Duplicate submissions are detected using resultId when supplied, otherwise a deterministic sample/test/value/unit fingerprint.
- Received results are written to the hospital audit log with patient and encounter provenance.
- Unknown samples, test mismatches and invalid lifecycle states are rejected without modifying patient data.

## HMIS interoperability mapping

HMIS middleware uses sampleId, testCode, resultValueString, and resultUnits for analyzer result delivery. CareFlow intentionally keeps the same field semantics while replacing HMIS's credential-in-body model with a hospital-scoped Bearer integration key.

HMIS documents ASTM and HL7 middleware paths in addition to the JSON result path. CareFlow's REST endpoint is the safe JSON boundary first; ASTM/HL7 transport adapters can be added later without bypassing the existing lab verification workflow.
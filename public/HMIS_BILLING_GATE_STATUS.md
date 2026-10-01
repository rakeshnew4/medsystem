# CareFlow Billing Gate — Validation Status

Date: 2026-10-01

## Current gate

Billing remains **In Progress**. No authenticated hospital-staff end-to-end completion has been claimed.

## External PostgreSQL read-only audit

Direct adapter queries currently report:
- invoices: 947
- invoice_payments: 0
- invalid invoice paid bounds: 0
- invalid invoice status consistency: 0
- invalid invoice-item arithmetic: 0
- invoice subtotal/item mismatches: 0
- legacy positive-balance invoices without immutable ledger rows: 946

The legacy balance is not reconstructed automatically because the original payment metadata is unavailable.

## Validator discrepancy

The deployed owner-only billing validator returns successful results for the first four invoice/item checks, but its five ledger-related checks currently report `Database query failed`.

The same five SQL checks execute successfully through the direct external PostgreSQL adapter and return zero structural violations, with 946 legacy ledger gaps.

This is a validator/runtime discrepancy, not evidence that Billing is complete. It must be resolved before the validator can be used as a release gate.

## Authenticated E2E gate

Still required:
- real billing-staff invoice creation
- incremental collection through final settlement
- invalid financial transitions
- role boundaries
- retry/concurrency behavior
- patient/encounter/workflow-event continuity
- invoice/PDF continuity

No synthetic owner/admin session is counted as hospital-staff E2E.
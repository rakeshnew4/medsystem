# Inventory / Assets Test Cases

TC-ASSET-001 Asset registration: create hospital-scoped asset with code, description, category, purchase price and depreciation metadata.

TC-ASSET-002 Asset search/isolation: search code, description or serial; only current hospital assets are returned.

TC-ASSET-003 Asset transfer: transfer active asset to a new location/custodian atomically and record history.

TC-ASSET-004 Closed asset protection: inactive/disposed asset transfer returns 409 without mutation.

TC-ASSET-005 Concurrent transfer: concurrent transfers must not produce a lost update or inconsistent history.

TC-ASSET-006 Auth boundary: unsigned /api/fixed-assets returns 401; only staff with action.assets.manage may use the route.

TC-ASSET-007 Transfer audit integrity: every transfer history row must remain hospital-scoped, retain the pre/post location and custodian values, and correspond to the atomic asset update.

TC-ASSET-008 Asset master-data validation: registration/update rejects unsupported lifecycle statuses, invalid depreciation rates/prices, and inactive/non-hospital custodians.

TC-ASSET-009 Transfer audit regression: transfer must not reference an undefined pre-state variable or return success without a corresponding history row.

TC-ASSET-010 Register UI: asset registration, search and transfer controls use the protected `/api/fixed-assets` contract and are hidden by the dedicated asset permission.

TC-ASSET-011 Production invariant validator: owner-only `/api/fixed-assets-validation` returns zero violations for lifecycle values, financial bounds, custodian isolation and transfer continuity.

TC-ASSET-012 Warranty/AMC reports: date-filtered warranty and AMC expiry reports remain hospital-scoped and distinguish expired from upcoming assets.

TC-ASSET-013 Transfer report: transfer history can be reviewed by asset/date/location without crossing hospital boundaries.

TC-ASSET-014 Depreciation/register report: calculated depreciation honors method, rate, as-of date and useful-life limits without mutating fixed-asset master data.

TC-ASSET-015 Adjacent inventory gap: HMIS pharmacy/store stock history and bin-card reporting must be assessed against CareFlow pharmacy_stock_transactions before the Inventory workflow is moved onward.

TC-ASSET-016 Stock-history schema gate: external PostgreSQL must contain pharmacy_stock and pharmacy_stock_transactions; direct production verification passed after applying the existing migration, with zero pre-existing rows.

TC-ASSET-017 Stock-history isolation: the read-only history report must filter by current hospital and optional date/medicine criteria and never expose another hospital's ledger.

TC-ASSET-018 Stock-history continuity: receipts and dispensing create transaction rows tied to the hospital-scoped stock record.

TC-ASSET-019 Bin-card report: hospital-scoped stock movement report exposes medicine, batch, transaction direction, quantity and balance-after without crossing hospitals.

TC-ASSET-020 Stock balance invariant: latest transaction quantity_after equals current pharmacy_stock.quantity for every stock item with ledger activity.

TC-ASSET-021 Stock ledger continuity: each transaction quantity_before equals the preceding transaction quantity_after for the same stock; receipt/dispense arithmetic is enforced.

TC-ASSET-022 Stock mutation snapshots: receipt and dispensing persist quantity_before/quantity_after with the ledger row, so the bin card can reconstruct movement without guessing from current stock.

TC-ASSET-023 Closing-stock report: hospital-scoped batch balances can be generated as of a selected date, with medicine/batch filters and optional inactive-stock inclusion.

TC-ASSET-024 Closing-stock balance source: where a ledger snapshot exists on/before the as-of date, the report uses quantity_after; otherwise it explicitly identifies the current-stock fallback.

Production validation: `/api/pharmacy-stock-validation` now returns 0 violations across all 11 ledger/balance/transfer checks after applying the external pharmacy transfer schema. Anonymous transfer access returns 401 and the unsigned app-user path is rejected by `requireStaff()`. Authenticated staff E2E remains the final workflow gate; the available test runner currently has no hospital staff session.

TC-ASSET-025 No-op transfer rejection: transferring an active asset to the exact same location and custodian is rejected with HTTP 409 and creates no transfer-history row or workflow event. The check is performed inside the transfer transaction so a concurrent update cannot turn a real transfer into a false success.

TC-ASSET-026 Duplicate asset-code safety: creating an asset with an existing asset_code in the same hospital returns HTTP 409 rather than a database 500; the hospital-scoped unique constraint remains the final concurrency-safe guard and no duplicate asset is created.

TC-ASSET-027 Production transfer-history safety: the owner-only validator must report zero no-op transfer rows and zero transfer rows attached to inactive/disposed/retired assets.

TC-ASSET-028 Asset-event continuity boundary: fixed-asset transfers are operational asset events, not patient/encounter events. The authoritative continuity record is the hospital-scoped `fixed_asset_transfers` row created in the same transfer transaction. CareFlow must not claim a patient `workflow_events` row for an asset transfer because the current workflow-event schema requires a patient identity. Authenticated asset E2E must verify the transfer row and actor/timestamp continuity instead.

Current validation status (2026-10-01): `/api/fixed-assets` anonymous access returns 401 and an app-user without a hospital staff identity is rejected with 401; `/api/fixed-assets-validation` reports 0 production violations. Pharmacy stock/transfer validation now returns 11/11 checks passing with 0 violations. The protected transfer route returns 401 without authentication and the available signed-in app-user path is rejected by `requireStaff()` with 401. Authenticated asset create/search/transfer and pharmacy stock mutation/dispensing/transfer execution remain open because no real hospital staff browser/session is available.

TC-ASSET-029 Pharmacy transfer issue: an authorized source-department staff member can issue positive available stock to a different hospital department atomically; source quantity decreases once, transfer becomes in_transit, and exactly one transfer_out ledger row records before/after balances.
TC-ASSET-030 Pharmacy transfer receive: only the destination department can receive an in_transit transfer; destination stock is created/reused and increased atomically, transfer becomes received, and exactly one transfer_in ledger row is linked.
TC-ASSET-031 Pharmacy transfer cancel: only the source department can cancel an in_transit transfer; source quantity is restored atomically, transfer becomes cancelled, and exactly one transfer_return ledger row is linked.
TC-ASSET-032 Invalid transfer transitions: receive/cancel of received or cancelled transfers returns HTTP 409 with no stock or ledger mutation; issue to the same department, inactive stock, unknown destination, or insufficient quantity is rejected.
TC-ASSET-033 Transfer concurrency/idempotency: concurrent receive/cancel attempts lock the transfer state so only one terminal transition succeeds and no duplicate destination/source movement or ledger row is created.
TC-ASSET-034 Transfer hospital isolation: source stock, destination department and transfer record must all belong to the current hospital; cross-hospital identifiers are rejected.
TC-ASSET-035 Transfer role boundary: issue/cancel requires source-department scope (unless admin); receive requires destination-department scope (unless admin); generic pharmacy manage permission alone must not bypass department ownership.
TC-ASSET-036 Transfer ledger/report continuity: transfer_out/transfer_in/transfer_return preserve quantity_before/quantity_after continuity and are represented correctly by stock history/bin-card movement.

Next inventory gate: authenticated hospital-staff E2E for asset and pharmacy transfer workflows remains mandatory. The new pharmacy transfer state machine is implemented and non-session safety coverage is ready, but no staff E2E completion may be claimed without a genuine staff session.
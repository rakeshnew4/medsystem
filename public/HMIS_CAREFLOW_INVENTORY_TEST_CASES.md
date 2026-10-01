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

Production validation: `/api/pharmacy-stock-validation` returned 0 violations across all 8 ledger/balance checks after the external schema update. Authenticated staff E2E remains the final workflow gate; the available test runner currently has no hospital staff session.

TC-ASSET-025 No-op transfer rejection: transferring an active asset to the exact same location and custodian is rejected with HTTP 409 and creates no transfer-history row or workflow event. The check is performed inside the transfer transaction so a concurrent update cannot turn a real transfer into a false success.

Current validation status (2026-10-01): `/api/fixed-assets` anonymous access returns 401 and an app-user without a hospital staff identity is rejected with 401; `/api/fixed-assets-validation` reports 0 production violations. Authenticated asset create/search/transfer and concurrent transfer execution remain open because no real hospital staff browser/session is available.
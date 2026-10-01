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

Authenticated staff E2E remains the final workflow gate; the available test runner currently has no hospital staff session.
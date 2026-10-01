# HMIS × CareFlow Staff / Roles Test Cases

Reference: HMIS `Privileges.java` and `UserPrivilageController.java` on the development branch.

- TC-STAFF-001: Register a staff email with role, optional doctor and optional hospital department.
- TC-STAFF-002: Staff list remains hospital-scoped and exposes department assignment.
- TC-STAFF-003: Update role, doctor, department and active status without crossing hospital boundaries.
- TC-STAFF-004: Global user permission override applies when no department-specific override exists.
- TC-STAFF-005: Department-specific user permission overrides the global user override for the assigned department.
- TC-STAFF-006: Department-specific permission cannot reference a department belonging to another hospital.
- TC-STAFF-007: Role permissions remain the baseline; user-specific department overrides take precedence.
- TC-STAFF-008: Administrator can edit a selected staff member's global or department-scoped override as Inherit / Allow / Deny, and Inherit removes the override.
- TC-STAFF-009: Anonymous staff/team/permission access remains HTTP 401.
- TC-STAFF-010: Inactive staff cannot access staff workflows.
- TC-STAFF-011: Production staff/permission validator reports zero violations across role values, activation state, doctor/department links, user overrides and permission keys.
- TC-STAFF-012: Authenticated staff E2E must verify role boundary and department-specific permission behavior before Staff/Roles is complete.
- TC-STAFF-013: Admin UI loads hospital staff and department scopes and renders Inherit / Allow / Deny state from the server response.
- TC-STAFF-014: Admin UI save and clear operations persist the selected global or department-scoped override and refresh the displayed state.
- TC-STAFF-015: Owner-only hospital configuration validator reports 7/7 checks with 0 violations; anonymous execution is HTTP 401.
- TC-STAFF-016: HMIS-aligned configuration resolution must prefer department scope, then institution/hospital scope, then global/application default; department scope must be hospital-isolated and must not be encoded by key-name conventions.
- TC-STAFF-017: Department-scoped configuration schema must be verified in the external PostgreSQL adapter before any staff-facing configuration read/write route is enabled.
- TC-STAFF-018: Authenticated staff E2E must verify department-first configuration resolution, fallback behavior, hospital isolation, invalid scope rejection and audit continuity before Staff/Roles/Configuration is complete.

Current implementation gate: external PostgreSQL staff/permission schema verified and department-scoped permission columns/indexes applied. Hospital-configuration validator is live and has passed 7/7 production checks with 0 violations. The department-scoped configuration schema is not yet verified in the external adapter, so no staff-facing ConfigOption read/write route is enabled. Authenticated staff execution remains pending because the available runner has no hospital staff session.
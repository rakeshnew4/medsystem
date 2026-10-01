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
- TC-STAFF-012: Department configuration inherits hospital-level defaults until an explicit department override is saved; clearing the override restores inheritance.
- TC-STAFF-013: Department configuration rejects a department from another hospital and anonymous access remains HTTP 401.
- TC-STAFF-014: Authenticated staff E2E must verify role boundary and department-specific permission behavior before Staff/Roles is complete.
- TC-STAFF-013: Admin UI loads hospital staff and department scopes and renders Inherit / Allow / Deny state from the server response.
- TC-STAFF-014: Admin UI save and clear operations persist the selected global or department-scoped override and refresh the displayed state.
- TC-STAFF-015: Owner-only hospital configuration validator reports 7/7 checks with 0 violations; anonymous execution is HTTP 401.
- TC-STAFF-016: HMIS-aligned configuration resolution must prefer department scope, then institution/hospital scope, then global/application default; department scope must be hospital-isolated and must not be encoded by key-name conventions.
- TC-STAFF-017: Department-scoped configuration schema must be verified in the external PostgreSQL adapter before any staff-facing configuration read/write route is enabled.
- TC-STAFF-018: Authenticated staff E2E must verify department-first configuration resolution, fallback behavior, hospital isolation, invalid scope rejection and audit continuity before Staff/Roles/Configuration is complete.
- TC-STAFF-019: Staff create/update/activation changes write hospital-scoped audit entries containing actor, action, entity identity and before/after state.
- TC-STAFF-020: Role/global/department permission changes and clearing an override write auditable staff lifecycle entries.
- TC-STAFF-021: Staff audit history is hospital-scoped and restricted to administrators; anonymous access remains HTTP 401.

Current implementation gate: external PostgreSQL staff/permission schema and `hospital_department_settings` schema are verified. External `audit_logs` is also verified in the adapter's `medsystem` schema. Hospital-configuration validator passes 7/7 with 0 violations. Staff lifecycle and permission audit writes plus an administrator-only history endpoint are implemented. Authenticated staff execution remains pending because the available runner has no hospital staff session.
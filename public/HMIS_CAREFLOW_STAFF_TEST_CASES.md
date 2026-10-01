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
- TC-STAFF-022: Staff directory supports search/filter by name/email/role/department/active state and shows hospital-scoped results. **v427 implemented; automated authenticated execution pending.**
- TC-STAFF-023: Staff detail preserves email, display name, role, doctor link, department and active state. **v427 implemented; automated authenticated execution pending.**
- TC-STAFF-024: Staff lifecycle actions use the existing /team contract and never allow cross-hospital mutation.
- TC-STAFF-025: Staff registration clearly distinguishes pending vs active accounts and handles duplicate-safe feedback.
- TC-STAFF-026: Role catalogue reflects only supported CareFlow roles and does not invent HMIS privilege categories.
- TC-STAFF-027: Role permission matrix groups/searches permissions and shows the role baseline.
- TC-STAFF-028: Global and department-scoped user overrides are clearly distinguished.
- TC-STAFF-029: Inherit clears the user override; Allow/Deny persist boolean overrides; effective state remains server-authoritative.
- TC-STAFF-030: Effective permission view identifies role baseline, user override and department override sources.
- TC-STAFF-031: Non-admin users cannot mutate role/user permission controls; protected API remains authoritative.
- TC-STAFF-032: Staff audit view shows actor/action/target/timestamp/before-after details and is administrator-only.
- TC-STAFF-033: Staff availability UI presents presence, schedule, exceptions and doctor availability using the existing contract.
- TC-STAFF-034: Hospital profile/configuration exposes existing identity/contact/timezone fields only.
- TC-STAFF-035: Module/feature/settings configuration preserves existing keys and save feedback.
- TC-STAFF-036: Department configuration explicitly shows inherited vs overridden values and reset-to-inherit.
- TC-STAFF-037: Hospital services, working hours and labels use existing configuration contracts and validation.
- TC-STAFF-038: Staff/permission and hospital-config validators are surfaced as health checks without replacing server validation.
- TC-STAFF-039: Staff administration remains usable on mobile without horizontal overflow.
- TC-STAFF-040: HMIS comparison confirms privilege grouping, administrator workflow and configuration semantics against the referenced development branch.
- TC-STAFF-041: Automated protected-route checks remain HTTP 401 anonymously; validators retain zero violations.
- TC-STAFF-042: Authenticated administrator/staff E2E covers lifecycle, permission precedence, audit and configuration; intentionally deferred until a genuine staff session is available.

Current implementation gate: external PostgreSQL staff/permission schema and `hospital_department_settings` schema are verified. External `audit_logs` is also verified in the adapter's `medsystem` schema. Hospital-configuration validator passes 7/7 with 0 violations. Staff lifecycle and permission audit writes plus an administrator-only history endpoint are implemented. U12 UI redesign is queued U12-01 through U12-23; authenticated E2E is intentionally deferred.
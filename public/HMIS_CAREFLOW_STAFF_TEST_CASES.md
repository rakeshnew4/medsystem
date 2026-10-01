# HMIS × CareFlow Staff / Roles Test Cases

Reference: HMIS `Privileges.java` and `UserPrivilageController.java` on the development branch.

- TC-STAFF-001: Register a staff email with role, optional doctor and optional hospital department.
- TC-STAFF-002: Staff list remains hospital-scoped and exposes department assignment.
- TC-STAFF-003: Update role, doctor, department and active status without crossing hospital boundaries.
- TC-STAFF-004: Global user permission override applies when no department-specific override exists.
- TC-STAFF-005: Department-specific user permission overrides the global user override for the assigned department.
- TC-STAFF-006: Department-specific permission cannot reference a department belonging to another hospital.
- TC-STAFF-007: Role permissions remain the baseline; user-specific department overrides take precedence.
- TC-STAFF-008: Anonymous staff/team/permission access remains HTTP 401.
- TC-STAFF-009: Inactive staff cannot access staff workflows.
- TC-STAFF-010: Authenticated staff E2E must verify role boundary and department-specific permission behavior before Staff/Roles is complete.

Current implementation gate: external PostgreSQL staff/permission schema verified and department-scoped permission columns/indexes applied. Authenticated staff execution remains pending because the available runner has no hospital staff session.
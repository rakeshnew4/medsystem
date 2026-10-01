# CareFlow UI Master Plan — HMIS-Aligned Module-by-Module Redesign

## Purpose
Redesign CareFlow's user interface completely, module by module, using current CareFlow workflows/data contracts and the verified HMIS development branch as the UI/workflow reference.
HMIS reference: https://github.com/hmislk/hmis
CareFlow: https://hospital-ai.hatchable.site

UI changes must never bypass server authorization or invent workflow states.

## UI principles
1. Hospital-home first: successful staff authentication lands on a normal hospital home/workspace, not a role-specific operational screen.
2. Module navigation: organize screens by hospital modules rather than implementation/API names.
3. Patient context is persistent: selected patient/admission shows identity, UHID/PHN where available, encounter/admission context and clear Back/Home.
4. Actions vs Reports: visually separate state-changing actions from read-only reports/history.
5. Worklists first: queues, appointments, admissions, lab, pharmacy and billing open on searchable/filterable worklists before detail forms.
6. Context before action: patient/encounter/department must be obvious before mutation buttons.
7. Dense desktop, usable mobile: tables on desktop; cards/actions on mobile without horizontal overflow.
8. Consistent command hierarchy: primary, secondary, destructive and navigation actions have stable treatment.
9. Operational state is prominent: pending/received/verified/paid/priority states are immediately visible.
10. Keyboard/search efficiency for reception, pharmacy, lab and billing.
11. Safe mutation UX: confirmation for destructive/irreversible actions; no optimistic clinical/financial/stock mutations.
12. Accessible feedback: loading, empty, error, success and validation states are always visible.

## Module sequence

### UI-00 — Global shell / design system
- [x] Header/sidebar foundation retained and navigation regrouped into OPD, Clinical & Diagnostics, Inpatient, Finance, Operations and Administration.
- [x] Hospital home/dashboard now has an HMIS-style module launcher with direct worklist/workspace entry points.
- [x] Patient-context bar — selected patient identity, UHID/PHN where available, active OPD/IPD state and admission/bed context are now the first workspace element.
- [x] Search/action pattern foundation added to Patient Lookup.
- [x] Existing modal/form/table/card primitives retained and extended with shared module-card/context styling.
- [x] Existing loading/error/empty infrastructure retained; UI work will standardize remaining module-specific states.
- [x] Responsive/mobile navigation foundation retained and module launcher made responsive.
- [x] Back/return foundation exists; module-specific contextual back behavior remains to be standardized.
- [x] Role/permission-aware navigation/action visibility foundation retained.
- [x] Remove baseline legacy visual inconsistencies across shared controls, focus states, disabled states and common table/action presentation; module-specific cleanup continues inside each module.

### UI-01 — Patient Registration & Patient Search
HMIS references: OPD Patient Lookup/Registration, EMR patient lookup, patient profile.
- [x] Search-first patient lookup UI.
- [ ] Search by UHID/PHN/name/phone/NIC where available — UI accepts identifier search text; backend identifier coverage remains to be expanded.
- [x] Duplicate-review flow is surfaced in the existing registration flow.
- [x] New patient registration entry point retained and made prominent.
- [x] Advanced demographics are already supported by the existing registration workflow.
- [x] Patient profile header/current-care context exists and is being visually standardized.
- [x] Patient timeline/context exists in the workspace.
- [x] Patient action launcher exists through Care workflow / Next action and is now part of the redesign target.
- [x] Patient history/report grouping exists; visual Actions vs Reports/History separation is now implemented with workspace tabs.

### UI-02 — Appointments / OPD
HMIS references: OPD patient lookup, token, queue, OPD billing.
- [x] Appointment worklist with date-grouped day view and date filtering
- [x] Doctor/session filters
- [x] New appointment flow
- [x] Check-in/token action
- [x] Cancellation/no-show states
- [x] Appointment detail/context through selected-patient workspace
- [x] OPD billing handoff through the patient workspace Finance/Billing action path
- [ ] Authenticated browser E2E for booking/check-in/cancel/no-show remains open until a real hospital staff session is available

### UI-03 — Queue / Token / Reception
- [x] Queue board by operational stage
- [x] Priority visibility
- [x] Call-next controls
- [x] Token display entry point
- [x] Reception kiosk
- [x] Exception/manual transition UI through constrained queue moves / drag-and-drop
- [x] Public token tracking entry point
- [x] Back-to-home navigation
- [ ] Authenticated browser E2E for queue dispatch/call-next and reception execution remains open until a real hospital staff session is available

### UI-04 — Nursing / Vitals / Triage
HMIS reference: nursing workbench and inpatient dashboard.
- [x] Nurse worklist/admission selector via role-aware Queue → My work and persistent Patient Workspace
- [x] Patient header
- [x] Vitals entry
- [x] Triage assessment
- [x] Nursing handoff
- [x] Alerts/red flags
- [x] Clinical history/report separation through Patient Workspace Actions vs Reports & History
- [ ] Authenticated browser E2E for nurse vitals/triage/handoff remains open until a real hospital staff session is available

### UI-05 — Doctor Consultation
HMIS reference: EMR OPD visit workspace (emr/opd_visit.xhtml) and patient encounter history.
- [x] Doctor worklist with waiting/today tabs and patient/UHID/token search
- [x] Consultation room header
- [x] Patient clinical summary
- [x] Vitals/triage/history
- [x] Clinical notes
- [ ] Diagnosis — no verified CareFlow diagnosis mutation contract exists yet; do not invent one
- [x] Orders/investigations
- [x] Prescription
- [x] Follow-up
- [x] Consultation completion
- [ ] Authenticated browser E2E for doctor consultation remains open until a real hospital staff session is available

### UI-06 — Laboratory
HMIS reference: laboratory worklist/result verification/LIS flow.
- [x] Lab worklist with search and status filters
- [x] Order status timeline through visible ordered → sample collected → processing → verified states
- [x] Sample collection
- [x] Processing/result entry
- [x] Verification
- [x] Report/history via patient workspace and clinical reports
- [x] Doctor notification state
- [x] Patient-context results
- [ ] Authenticated browser E2E for lab sample/result/verification remains open until a real hospital staff session is available

### UI-07 — Pharmacy / Dispensing / Stock
HMIS references: pharmacy navigation, transfer request, issue, receive, bin card, reports.
- [x] Pharmacy workbench
- [x] Dispensing queue
- [x] Prescription/medicine context
- [x] Batch/expiry/FEFO presentation through stock summary and existing stock ordering
- [x] Stock list
- [x] Stock history
- [x] Bin card
- [x] Closing stock
- [x] Transfer request/issue/receive — existing state machine surfaced through the pharmacy operations layer
- [x] Transfer status timeline — existing transfer state is preserved by backend
- [x] Reports
- [ ] Authenticated browser E2E for dispensing and transfer/receive/cancel remains open until a real hospital staff session is available

### UI-08 — IPD / Admissions / Beds / Transfers / Discharge
HMIS reference: inpatient search plus central Admission Profile.
- [x] Admission search/worklist
- [x] Bed board
- [x] Admission profile as central hub through Patient Workspace
- [x] Patient/BHT header
- [x] Room/bed actions
- [x] Transfer
- [x] Nursing/clinical actions
- [x] Theatre/procedure entry
- [x] Billing/report separation
- [x] Discharge workflow
- [ ] Authenticated browser E2E for admission/transfer/discharge remains open until a real hospital staff session is available

### UI-09 — Billing / Charges / Payments
- [x] Billing worklist — searchable by invoice/patient/UHID/phone with payment-state filter and outstanding-balance summary
- [x] Patient/invoice context — invoice rows open invoice detail or the selected patient's workspace while preserving financial context
- [x] Charge grouping — invoice line items are grouped into HMIS-style operational charge categories in read-only invoice detail
- [ ] Invoice editor
- [x] Payment history — invoice-level payment ledger is presented with date, amount, method, reference and receiver
- [x] Payment entry — existing protected incremental-payment transition is exposed through invoice detail
- [x] Outstanding/paid states — unpaid/partial/paid counts and outstanding amount are visible in the billing worklist
- [x] Insurance — read-only hospital-scoped claims worklist with payer/policy/claim/patient search and claim-state filters; uses existing protected `/api/insurance` contract
- [x] PDF/print actions — invoice detail opens the existing protected /api/invoice-pdf route
- [x] Financial audit/history — read-only payment ledger, billing workflow events and matching invoice audit events are exposed through protected /api/billing-audit and surfaced from invoice detail.

### UI-10 — Theatre / Procedures
HMIS references: surgery pages, surgery clinical details, admission profile.
- [x] Procedure worklist — HMIS-aligned search by patient/UHID/admission/procedure/doctor/room with status and date filters, patient/admission context, lifecycle-aware actions, and responsive worklist presentation.
- [x] Room schedule — room-by-room view built from hospital-scoped Theatre rooms and existing scheduled/in-progress procedures; no new scheduling mutation introduced.
- [x] Patient/procedure header — selected procedure detail presents patient/UHID/BHT, admission, procedure, doctor, room, lifecycle, schedule and outcome context.
- [x] Surgical team — selected procedure presents existing team assignments and exposes only the verified team_add/team_remove contracts.
- [x] Lifecycle controls — selected procedure and worklist expose only scheduled→in_progress→completed and scheduled→cancelled transitions, with completion outcome capture.
- [x] Theatre charges — selected procedure presents protected charge records and existing billing-authorized charge creation.
- [x] Ward return — completed admission-linked procedures expose the existing protected ward_return transition and admission/encounter context.
- [x] Validation/revert — selected completed procedures expose the existing protected validation and validation-revert contracts with required revert reason.
- [x] Clinical/financial closure presentation — selected procedure combines lifecycle, outcome, charges, validation and ward-return state in one closure view.

### UI-11 — Inventory / Assets
HMIS references: Store inventory/asset registry, fixed-asset reports, stock history/bin-card and pharmacy stock transfer/receive workflows. CareFlow keeps fixed assets and consumable pharmacy/store stock distinct while presenting them in one operational inventory workspace.
- [x] Inventory worklist — searchable/filterable hospital-scoped fixed-asset register with status/category/location context and responsive actions.
- [x] Asset/item detail — asset code, description, serial, value, location, custodian, lifecycle and warranty/AMC context exposed through the existing detail/history contract.
- [x] Inventory catalogue — category filters and pharmacy/store stock catalogue are surfaced without creating a duplicate stock master.
- [x] Stock movement history — existing pharmacy stock history, bin-card and closing-stock reports remain reachable and are complemented by the inventory stock view.
- [x] Asset transfer workflow — existing atomic fixed-asset transfer contract is exposed with location/custodian continuity.
- [x] Pharmacy stock transfer workflow — existing issue → in_transit → receive/cancel contract is surfaced with source/destination department controls; no new stock mutation semantics invented.
- [x] Assignment/location context — current custodian and department/location are visible; reassignment uses the existing protected transfer contract.
- [x] Maintenance/service state — existing asset lifecycle status and warranty/AMC fields are presented; no unsupported maintenance mutation is invented.
- [x] Inventory validation boundary — server-side fixed-asset and pharmacy-stock validators remain authoritative; UI does not claim local validation as an integrity guarantee.
- [x] Asset history/audit — transfer history, actor/date and report views are available through existing protected/read-only contracts.
- [x] Operational inventory dashboard — asset totals, active/maintenance counts, register value and expiry watch are surfaced alongside stock and transfer worklists.
- [x] Role/authorization UX — Inventory uses the existing action.assets.manage and pharmacy permission boundaries; transfer receive/cancel remains server-authorized by department.
- [x] Mobile/responsive workflow — search/filter/action controls use the existing responsive queue/worklist patterns and compact transfer controls.
- [ ] Authenticated E2E closure — real hospital-staff execution of asset create/search/transfer and pharmacy issue/receive/cancel remains open because the available runner has no genuine staff session.

### UI-12 — Staff / Roles / Permissions / Hospital Setup
HMIS references: `Privileges.java`, `UserPrivilageController.java`, `ConfigOption.java`, `ConfigOptionController.java`, `AuditEventController.java`, and `all_audit_events.xhtml`. CareFlow already has protected staff, permission, department, availability, hospital-configuration and staff-audit contracts; U12 is the UI/operational redesign of those verified contracts.

- [x] U12-01 Staff directory worklist — v427: searchable/filterable staff register with name/email/role/department/status filters, counts and clear empty state.
- [x] U12-02 Staff identity/detail — v427: selected staff profile with email, display name, role, doctor link, department, active state and hospital context.
- [x] U12-03 Staff lifecycle controls — v428: selected-record activate/deactivate, supported role assignment, doctor association and department assignment using the existing `/team` contract, with audit history.
- [x] U12-04 Staff registration flow — v428: display name, email, supported role, optional department/doctor link and pending/active distinction using the existing `/team` POST contract.
- [x] U12-05 Department context — v428: hospital-scoped department cards show staff/active counts and role context and link back to directory filtering.
- [x] U12-06 Role catalogue — v428: supported CareFlow roles with current staff and enabled-permission counts; no unsupported HMIS privilege categories introduced.
- [ ] U12-07 Role permission matrix — group/search permission baseline by supported role.
- [ ] U12-07 Role permission matrix — searchable/grouped permissions with role baseline state and safe admin-only mutation controls.
- [ ] U12-08 User permission overrides — global user override and department-scoped override presented together with explicit scope.
- [ ] U12-09 Inherit / Allow / Deny UX — make effective-vs-override state explicit; Inherit clears the user override rather than writing a fake third backend value.
- [ ] U12-10 Effective permission view — show effective permission result alongside role baseline and user/dept override sources.
- [ ] U12-11 Permission safety/authorization feedback — admin-only controls, server-authoritative errors, cross-hospital rejection and clear destructive-action confirmation.
- [ ] U12-12 Staff audit/history — searchable read-only lifecycle/permission audit history with actor, action, target, timestamp and before/after details.
- [ ] U12-13 Staff availability — work status, schedule, exceptions and doctor availability context using the existing availability contract.
- [ ] U12-14 Hospital profile/configuration — hospital identity, contact, timezone and core setup grouped as administrator configuration.
- [ ] U12-15 Hospital modules/features/settings — module enablement, feature flags and operational defaults presented with safe save/feedback states.
- [ ] U12-16 Department configuration — department-level overrides with explicit inherited/overridden state and safe reset-to-inherit behavior.
- [ ] U12-17 Services/working hours/labels — existing hospital service catalogue, working hours and labels presented as configuration worklists/forms.
- [ ] U12-18 Configuration validation — surface the existing hospital/staff/permission validators as administrator health checks without replacing server validation.
- [ ] U12-19 Responsive/mobile administration — staff tables, permission matrix and configuration forms usable on narrow screens without horizontal overflow.
- [ ] U12-20 HMIS comparison pass — verify navigation, privilege grouping, admin workflow and configuration semantics against the referenced HMIS implementation.
- [ ] U12-21 Documentation/test pass — update HMIS UI plan, staff test cases and persistent continuation queue after each verified increment.
- [ ] U12-22 Automated access/contract verification — protected routes, validator results, hospital isolation and no-regression checks.
- [ ] U12-23 Authenticated administrator/staff E2E — real staff session coverage for staff lifecycle, permissions, audit and configuration; this remains a separate final gate and can be completed later as requested.

### UI-13 — Integrations / REST / FHIR / LIS
- [ ] Integration capabilities
- [ ] Integration settings
- [ ] Connection/status views
- [ ] Key management UX
- [ ] LIS/HL7/ASTM status and diagnostics

### UI-14 — Reporting / Analytics
- [ ] Report index
- [ ] Date/filter controls
- [ ] Export/print
- [ ] KPI cards
- [ ] Operational dashboards
- [ ] Financial dashboards
- [ ] Clinical/quality views
- [ ] Inventory reports

## Per-module completion gate
A module is UI-complete only when the UI reflects the verified HMIS workflow, all states have visible feedback, patient/encounter/department context is clear, actions are permission-aware, mutation buttons map to existing server transitions, desktop and mobile layouts work, no console-breaking UI errors are introduced, and authenticated browser E2E is recorded separately when available.

## Current execution queue
1. UI-00 Global shell/design system
2. UI-01 Patient Registration & Search
3. UI-02 Appointments/OPD
4. UI-03 Queue/Reception
5. UI-04 Nursing/Triage
6. UI-05 Doctor Consultation
7. UI-06 Laboratory
8. UI-07 Pharmacy
9. UI-08 IPD
10. UI-09 Billing
11. UI-10 Theatre
12. UI-11 Inventory/Assets
13. UI-12 Staff/Setup
14. UI-13 Integrations
15. UI-14 Reporting/Analytics

## HMIS UI findings driving this plan
- HMIS uses a normal hospital home with module navigation and direct module entry points.
- OPD exposes Patient Lookup & Registration, OPD Token and OPD Queue as distinct navigation concepts.
- HMIS Pharmacy separates transfer request, issue, receive, bin card and reporting screens.
- HMIS Inpatient uses admission_profile.xhtml as a central hub for a selected admission/BHT.
- HMIS's recent inpatient redesign explicitly separates stateful Actions from read-only Reports/History and makes patient identity prominent.
- HMIS Nursing Workbench is centered around a selected admission/room and its available clinical/operational actions.
- These patterns will be adapted to CareFlow's modern web architecture rather than copying HMIS source code.

## Change tracking
- 2026-10-01: UI-11 one-pass increment deployed as v423 against HMIS Store inventory/asset registry, fixed-asset reports, stock history/bin-card and pharmacy transfer/receive references. CareFlow Inventory now has a unified operational worklist, asset detail/history presentation, category/status/location filters, inventory dashboard, pharmacy/store stock catalogue, and stock transfer workbench using the existing protected contracts. A real defect in the existing pharmacy transfer issue boundary was corrected so issue creates a new transfer without requiring a pre-existing transfer_id; receive/cancel still require transfer_id. v423 dry-run returned 0 errors; anonymous fixed-assets and pharmacy transfer routes returned 401; fixed-asset validation returned 0 violations and pharmacy-stock validation returned 11/11 checks with 0 violations. Authenticated hospital-staff E2E remains the only UI-11 completion gate.
- 2026-10-01: UI master plan created. Execution starts with UI-00 Global shell, then UI-01 Patient Registration/Search.
- 2026-10-01: UI-00 increment deployed to the working tree: HMIS-style module launcher added to Hospital Home; primary navigation regrouped around OPD, Clinical/Diagnostics, Inpatient, Finance, Operations and Administration; responsive module cards added.
- 2026-10-01: UI-01 increment started: Patient Lookup redesigned as a lookup-first workspace with prominent New Patient action, search/filter toolbar and clearer patient-record selection hierarchy. Existing backend/API behavior preserved.
- 2026-10-01: UI-01 increment deployed as v399: selected-patient identity/context bar added with UHID/PHN and OPD/IPD/admission state; Patient Workspace now separates operational Actions from Reports & History. No backend workflow transitions changed.
- 2026-10-01: UI-00 baseline cleanup: shared legacy controls now have consistent focus-visible, disabled, action-row, table-hover and error/loading presentation.
- 2026-10-01: UI-09 increment deployed as v408: Billing is a searchable/filterable financial worklist with explicit outstanding-balance summary and patient/UHID/phone context; existing billing mutation contracts are unchanged. Dry-run passed with 0 errors. Anonymous billing access remains protected and the available signed-in app-user harness is rejected by hospital-staff authorization. Next UI-09 task: charge grouping and invoice detail/payment-history presentation; authenticated billing E2E remains open.
- 2026-10-01: UI-00 baseline cleanup increment: normalized shared legacy controls with consistent focus-visible treatment, disabled-state behavior, action-row alignment, table hover feedback and common error/loading presentation. No workflow or backend behavior changed. Next UI target: UI-01 identifier search coverage.
- 2026-10-01: UI-09 Insurance increment deployed as v413: added a dedicated Insurance/TPA claims worklist backed by the existing protected `/api/insurance` contract. Claims can be searched by payer, claim/policy number, patient or UHID and filtered by pending/submitted/approved/partially-approved/rejected/paid state; no financial mutation contract was introduced. Public access to the underlying route remains protected (401 in the pre-deploy access test). Next UI-09 task: financial audit/history; invoice editor remains blocked until a verified server mutation contract exists.
- 2026-10-01: UI-09 financial audit/history increment deployed as v415: added protected, read-only `/api/billing-audit` with hospital-scoped payment ledger, billing workflow events and matching invoice audit events, plus an Audit history action from invoice detail. Public access returns 401 and the available unsigned app-user runner is rejected by `requireStaff()`. No financial mutation was introduced. Invoice editor remains blocked pending a verified server-side mutation contract.
- 2026-10-01: UI-10 Theatre increment deployed as v417: procedure worklist now follows the HMIS surgery-search pattern with patient/UHID/admission/procedure/doctor/room search, status/date filters, BHT/admission context, scheduled end-time context and lifecycle-aware existing actions. No Theatre backend mutation contract changed. Dry-run passed with 0 errors; anonymous `/api/theatre` remains 401. Next UI-10 task: room schedule.
- 2026-10-01: UI-10 Theatre full UI loop implemented and deployed as v421: room schedule, patient/procedure header, surgical team, lifecycle controls, charge presentation, ward return, validation/revert, and clinical/financial closure view. Permission-aware controls use existing protected Theatre/billing contracts; no scheduling or clinical/financial mutation contract was invented. Dry-run passed with 0 errors; production Theatre validator returned 22/22 checks passing with 0 violations; anonymous protected Theatre routes returned 401. Authenticated hospital-staff E2E remains open.
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
- [ ] Remove legacy visual inconsistencies — ongoing module-by-module.

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
- [ ] Appointment worklist/calendar
- [ ] Doctor/session filters
- [ ] New appointment flow
- [ ] Check-in/token action
- [ ] Cancellation/no-show states
- [ ] Appointment detail/context
- [ ] OPD billing handoff

### UI-03 — Queue / Token / Reception
- [ ] Queue board by operational stage
- [ ] Priority visibility
- [ ] Call-next controls
- [ ] Token display
- [ ] Reception kiosk
- [ ] Exception/manual transition UI
- [ ] Public token tracking
- [ ] Back-to-home navigation

### UI-04 — Nursing / Vitals / Triage
HMIS reference: nursing workbench and inpatient dashboard.
- [ ] Nurse worklist/admission selector
- [ ] Patient header
- [ ] Vitals entry
- [ ] Triage assessment
- [ ] Nursing handoff
- [ ] Alerts/red flags
- [ ] Clinical history/report separation

### UI-05 — Doctor Consultation
- [ ] Doctor worklist
- [ ] Consultation room header
- [ ] Patient clinical summary
- [ ] Vitals/triage/history
- [ ] Clinical notes
- [ ] Diagnosis
- [ ] Orders/investigations
- [ ] Prescription
- [ ] Follow-up
- [ ] Consultation completion

### UI-06 — Laboratory
HMIS reference: laboratory worklist/result verification/LIS flow.
- [ ] Lab worklist
- [ ] Order status timeline
- [ ] Sample collection
- [ ] Processing/result entry
- [ ] Verification
- [ ] Report/history
- [ ] Doctor notification state
- [ ] Patient-context results

### UI-07 — Pharmacy / Dispensing / Stock
HMIS references: pharmacy navigation, transfer request, issue, receive, bin card, reports.
- [ ] Pharmacy workbench
- [ ] Dispensing queue
- [ ] Prescription/medicine context
- [ ] Batch/expiry/FEFO presentation
- [ ] Stock list
- [ ] Stock history
- [ ] Bin card
- [ ] Closing stock
- [ ] Transfer request/issue/receive
- [ ] Transfer status timeline
- [ ] Reports

### UI-08 — IPD / Admissions / Beds / Transfers / Discharge
HMIS reference: inpatient search plus central Admission Profile.
- [ ] Admission search/worklist
- [ ] Bed board
- [ ] Admission profile as central hub
- [ ] Patient/BHT header
- [ ] Room/bed actions
- [ ] Transfer
- [ ] Nursing/clinical actions
- [ ] Theatre/procedure entry
- [ ] Billing/report separation
- [ ] Discharge workflow

### UI-09 — Billing / Charges / Payments
- [ ] Billing worklist
- [ ] Patient/invoice context
- [ ] Charge grouping
- [ ] Invoice editor
- [ ] Payment history
- [ ] Payment entry
- [ ] Outstanding/paid states
- [ ] Insurance
- [ ] PDF/print actions
- [ ] Financial audit/history

### UI-10 — Theatre / Procedures
HMIS references: surgery pages, surgery clinical details, admission profile.
- [ ] Procedure worklist
- [ ] Room schedule
- [ ] Patient/procedure header
- [ ] Surgical team
- [ ] Lifecycle controls
- [ ] Theatre charges
- [ ] Ward return
- [ ] Validation/revert
- [ ] Clinical/financial closure presentation

### UI-11 — Inventory / Assets
- [ ] Asset register
- [ ] Asset detail
- [ ] Location/custodian
- [ ] Transfer history
- [ ] Warranty/AMC
- [ ] Depreciation/register reports
- [ ] Pharmacy stock transfer UI integration

### UI-12 — Staff / Roles / Permissions / Hospital Setup
- [ ] Staff directory
- [ ] Staff detail
- [ ] Department scope
- [ ] Permission matrix
- [ ] Inherit/Allow/Deny controls
- [ ] Audit history
- [ ] Hospital configuration

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
- 2026-10-01: UI master plan created. Execution starts with UI-00 Global shell, then UI-01 Patient Registration/Search.
- 2026-10-01: UI-00 increment deployed to the working tree: HMIS-style module launcher added to Hospital Home; primary navigation regrouped around OPD, Clinical/Diagnostics, Inpatient, Finance, Operations and Administration; responsive module cards added.
- 2026-10-01: UI-01 increment started: Patient Lookup redesigned as a lookup-first workspace with prominent New Patient action, search/filter toolbar and clearer patient-record selection hierarchy. Existing backend/API behavior preserved.
- 2026-10-01: UI-01 increment deployed as v399: selected-patient identity/context bar added with UHID/PHN and OPD/IPD/admission state; Patient Workspace now separates operational Actions from Reports & History. No backend workflow transitions changed.
ALTER TABLE staff_profiles ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE staff_profiles ADD CONSTRAINT uq_staff_hospital_email UNIQUE(hospital_id,email);

CREATE TABLE permissions (
  id BIGSERIAL PRIMARY KEY,
  permission_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT
);

CREATE TABLE role_permissions (
  role TEXT NOT NULL,
  permission_key TEXT NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY(role,permission_key)
);

CREATE TABLE user_permissions (
  staff_id BIGINT NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL,
  PRIMARY KEY(staff_id,permission_key)
);

INSERT INTO permissions(permission_key,label,category,description) VALUES ('action.lab.manage','Manage lab','Actions','Complete lab orders and reports'),('action.pharmacy.manage','Manage pharmacy','Actions','Manage pharmacy dispensing'),('page.dashboard','Overview','Pages','Hospital overview'),('page.queue','Queue board','Pages','Patient flow and queue'),('page.appointments','Appointments','Pages','Appointments and scheduling'),('page.patients','Patients','Pages','Patient registration and list'),('page.doctors','Doctors','Pages','Doctor directory'),('page.beds','Beds & admissions','Pages','Beds and admissions'),('page.followups','Follow-ups','Pages','Follow-up management'),('page.staff','Staff','Pages','Staff and access management'),('page.setup','Hospital setup','Pages','Hospital configuration'),('action.patient.create','Register patient','Actions','Create a patient'),('action.appointment.create','Book appointment','Actions','Create appointments'),('action.queue.manage','Manage queue','Actions','Add and move queue entries'),('action.vitals.record','Record vitals','Actions','Record patient vitals'),('action.clinical.view','View clinical records','Actions','View patient clinical records'),('action.clinical.write','Write clinical records','Actions','Create visits, lab orders, medicines and reports'),('action.beds.manage','Manage beds','Actions','Create, assign and discharge beds'),('action.followups.manage','Manage follow-ups','Actions','Create and update follow-ups'),('action.doctors.manage','Manage doctors','Actions','Create and update doctors'),('action.ai.use','Use admin AI','Actions','Use administrative AI assistant'),('action.staff.manage','Manage staff','Actions','Register users and permissions'),('action.setup.manage','Manage hospital setup','Actions','Edit hospital configuration');

INSERT INTO role_permissions(role,permission_key,allowed) SELECT 'admin',permission_key,true FROM permissions;
INSERT INTO role_permissions(role,permission_key,allowed) SELECT 'receptionist',permission_key,true FROM permissions WHERE permission_key IN ('page.dashboard','page.queue','page.appointments','page.patients','page.doctors','page.followups','action.patient.create','action.appointment.create','action.queue.manage','action.followups.manage','action.ai.use');
INSERT INTO role_permissions(role,permission_key,allowed) SELECT 'nurse',permission_key,true FROM permissions WHERE permission_key IN ('page.dashboard','page.queue','page.patients','page.beds','page.followups','action.queue.manage','action.vitals.record','action.clinical.view','action.followups.manage');
INSERT INTO role_permissions(role,permission_key,allowed) SELECT 'doctor',permission_key,true FROM permissions WHERE permission_key IN ('page.dashboard','page.queue','page.patients','page.doctors','page.followups','action.queue.manage','action.vitals.record','action.clinical.view','action.clinical.write','action.followups.manage');
INSERT INTO role_permissions(role,permission_key,allowed) SELECT 'lab',permission_key,true FROM permissions WHERE permission_key IN ('page.dashboard','page.queue','page.patients','action.queue.manage','action.clinical.view','action.lab.manage');
INSERT INTO role_permissions(role,permission_key,allowed) SELECT 'pharmacy',permission_key,true FROM permissions WHERE permission_key IN ('page.dashboard','page.queue','page.patients','action.queue.manage','action.clinical.view','action.pharmacy.manage');
INSERT INTO role_permissions(role,permission_key,allowed) SELECT 'pending',permission_key,false FROM permissions;
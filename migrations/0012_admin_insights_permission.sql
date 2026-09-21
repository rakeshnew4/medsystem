-- Admin analytics permission
INSERT INTO permissions(permission_key,label,category,description)
VALUES ('page.admin_insights','Admin analytics','Pages','Hospital-level operational dashboard, filters and doctor statistics')
ON CONFLICT (permission_key) DO NOTHING;
INSERT INTO role_permissions(role,permission_key,allowed)
VALUES ('admin','page.admin_insights',true)
ON CONFLICT (role,permission_key) DO UPDATE SET allowed=true;
import { db } from "../lib/db.js";

export const access="admin";
export const methods=["GET"];

export default async function(req,res){
  const checks = await Promise.all([
    db.query("SELECT count(*)::int AS n FROM staff_profiles s WHERE s.hospital_id IS NULL"),
    db.query("SELECT count(*)::int AS n FROM staff_profiles s LEFT JOIN departments d ON d.id=s.department_id WHERE s.department_id IS NOT NULL AND (d.id IS NULL OR d.hospital_id<>s.hospital_id)"),
    db.query("SELECT count(*)::int AS n FROM user_permissions up LEFT JOIN staff_profiles s ON s.id=up.staff_id LEFT JOIN departments d ON d.id=up.department_id WHERE s.id IS NULL OR up.department_id IS NOT NULL AND (d.id IS NULL OR d.hospital_id<>s.hospital_id)"),
    db.query("SELECT count(*)::int AS n FROM user_permissions WHERE allowed IS NULL"),
    db.query("SELECT count(*)::int AS n FROM role_permissions rp LEFT JOIN permissions p ON p.permission_key=rp.permission_key WHERE p.permission_key IS NULL"),
    db.query("SELECT count(*)::int AS n FROM user_permissions up LEFT JOIN permissions p ON p.permission_key=up.permission_key WHERE p.permission_key IS NULL"),
    db.query("SELECT count(*)::int AS n FROM staff_profiles s WHERE s.role='pending' AND s.active=true")
  ]);
  const names=[
    "staff_without_hospital",
    "staff_cross_hospital_department",
    "permission_orphan_or_cross_hospital",
    "permission_null_allowed",
    "role_permission_unknown_key",
    "user_permission_unknown_key",
    "active_pending_staff"
  ];
  const violations=Object.fromEntries(names.map((n,i)=>[n,checks[i].rows[0].n]));
  const total=Object.values(violations).reduce((a,b)=>a+b,0);
  return res.json({
    ok:total===0,
    total_violations:total,
    checks:Object.keys(violations).length,
    violations
  });
}
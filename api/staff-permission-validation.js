import { db } from "../lib/db.js";

export const access="admin";
export const methods=["GET"];

export default async function(req,res){
  const checks=[];
  async function check(name,sql,params=[]){
    const r=await db.query(sql,params);
    const violations=Number(r.rows[0]?.violations||0);
    checks.push({name,violations});
  }

  await check("invalid_staff_roles",`
    SELECT count(*)::int AS violations
    FROM staff_profiles
    WHERE role IS NULL OR role NOT IN ('admin','doctor','nurse','receptionist','lab','pharmacy','pending')
  `);

  await check("active_pending_staff",`
    SELECT count(*)::int AS violations
    FROM staff_profiles
    WHERE active=true AND role='pending'
  `);

  await check("staff_missing_email",`
    SELECT count(*)::int AS violations
    FROM staff_profiles
    WHERE trim(coalesce(email,''))=''
  `);

  await check("cross_hospital_or_missing_doctor",`
    SELECT count(*)::int AS violations
    FROM staff_profiles s
    LEFT JOIN doctors d ON d.id=s.doctor_id
    WHERE s.doctor_id IS NOT NULL
      AND (d.id IS NULL OR d.hospital_id<>s.hospital_id)
  `);

  await check("cross_hospital_or_missing_department",`
    SELECT count(*)::int AS violations
    FROM staff_profiles s
    LEFT JOIN departments d ON d.id=s.department_id
    WHERE s.department_id IS NOT NULL
      AND (d.id IS NULL OR d.hospital_id<>s.hospital_id)
  `);

  await check("orphan_or_cross_hospital_user_overrides",`
    SELECT count(*)::int AS violations
    FROM user_permissions up
    LEFT JOIN staff_profiles s ON s.id=up.staff_id
    LEFT JOIN departments d ON d.id=up.department_id
    WHERE s.id IS NULL
       OR up.department_id IS NOT NULL AND (d.id IS NULL OR d.hospital_id<>s.hospital_id)
  `);

  await check("unknown_user_permission_keys",`
    SELECT count(*)::int AS violations
    FROM user_permissions up
    LEFT JOIN permissions p ON p.permission_key=up.permission_key
    WHERE p.permission_key IS NULL
  `);

  await check("unknown_role_permission_keys_or_roles",`
    SELECT count(*)::int AS violations
    FROM role_permissions rp
    LEFT JOIN permissions p ON p.permission_key=rp.permission_key
    WHERE p.permission_key IS NULL
       OR rp.role IS NULL
       OR rp.role NOT IN ('admin','doctor','nurse','receptionist','lab','pharmacy','pending')
  `);

  const total=checks.reduce((n,x)=>n+x.violations,0);
  res.json({ok:total===0,checks,total_violations:total});
}
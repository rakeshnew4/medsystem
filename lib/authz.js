import { auth, db } from "hatchable";

export async function requireStaff(req,res,roles=[]){
  const user=await auth.getUser(req);
  if(!user){res.status(401).json({error:"Sign in required"});return null;}
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]){res.status(400).json({error:"Create a hospital first"});return null;}
  let s=await db.query("SELECT id,hospital_id,user_id,email,display_name,role,doctor_id,active FROM staff_profiles WHERE user_id=$1 LIMIT 1",[user.id]);
  if(!s.rows[0]){
    const first=await db.query("SELECT count(*)::int AS n FROM staff_profiles WHERE hospital_id=$1",[h.rows[0].id]);
    const role=first.rows[0].n===0?"admin":"pending";
    await db.query("INSERT INTO staff_profiles(hospital_id,user_id,email,display_name,role,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO NOTHING",[h.rows[0].id,user.id,user.email,user.name||user.email,role,role!=="pending"]);
    s=await db.query("SELECT id,hospital_id,user_id,email,display_name,role,doctor_id,active FROM staff_profiles WHERE user_id=$1 LIMIT 1",[user.id]);
  }
  const staff=s.rows[0];
  if(!staff.active || staff.role==="pending"){res.status(403).json({error:"Your staff account is awaiting activation by an administrator",staff});return null;}
  if(roles.length && !roles.includes(staff.role)){res.status(403).json({error:"You do not have permission for this action",role:staff.role});return null;}
  return {user,staff,hospitalId:h.rows[0].id};
}
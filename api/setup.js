import { auth } from "hatchable";
import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST"];
export default async function(req,res){
  const user=await auth.getUser(req);
  if(!user)return res.status(401).json({error:"Sign in required"});
  if(req.method==="POST"){
    const ctx=await requirePermission(req,res,"action.setup.manage");
    if(!ctx)return;
    const b=req.body||{};
    if(!b.name)return res.status(400).json({error:"Hospital name is required"});
    const existing=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
    let hid;
    if(existing.rows[0]){
      hid=existing.rows[0].id;
      const staff=await db.query("SELECT id,role,active FROM staff_profiles WHERE user_id=$1",[user.id]);
      if(!staff.rows[0])return res.status(403).json({error:"Staff profile not found"});
      if(staff.rows[0].role!=="admin"||!staff.rows[0].active)return res.status(403).json({error:"Only an active administrator can update hospital setup"});
      await db.query("UPDATE hospitals SET name=$1,phone=$2,address=$3,updated_at=now() WHERE id=$4",[b.name,b.phone||null,b.address||null,hid]);
    }else{
      const r=await db.query("INSERT INTO hospitals(name,phone,address) VALUES($1,$2,$3) RETURNING id",[b.name,b.phone||null,b.address||null]);
      hid=r.rows[0].id;
      await db.query("INSERT INTO staff_profiles(hospital_id,user_id,email,display_name,role,active) VALUES($1,$2,$3,$4,'admin',true) ON CONFLICT(user_id) DO NOTHING",[hid,user.id,user.email,user.name||user.email]);
    }
    const r=await db.query("SELECT id,name,phone,address,timezone FROM hospitals WHERE id=$1",[hid]);
    return res.json(r.rows[0]);
  }
  const r=await db.query("SELECT id,name,phone,address,timezone FROM hospitals ORDER BY id LIMIT 1");
  res.json(r.rows[0]||null);
}
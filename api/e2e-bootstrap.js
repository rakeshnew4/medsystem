import { auth } from "hatchable";
import { db } from "../lib/db.js";
import { PRIMARY_ADMIN_EMAIL } from "../lib/authz.js";

export const access="user";
export const methods=["POST"];

const ROLES=["admin","receptionist","nurse","doctor","lab","pharmacy","billing"];

export default async function(req,res){
  const user=await auth.getUser(req);
  if(!user)return res.status(401).json({error:"Sign in with Hatchable first"});
  if(String(user.email||"").toLowerCase()!==PRIMARY_ADMIN_EMAIL)return res.status(403).json({error:"E2E bootstrap is available to the primary administrator only"});
  const role=String(req.body?.role||"").toLowerCase();
  if(!ROLES.includes(role))return res.status(400).json({error:"Unsupported E2E role"});
  const token=globalThis.crypto.randomUUID()+globalThis.crypto.randomUUID();
  await db.query("INSERT INTO admin_role_preview_sessions(token,admin_user_id,role) VALUES($1,$2,$3)",[token,String(user.id),role]);
  res.cookie("careflow_role_session",token,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:60*60*1000});
  return res.json({ok:true,role,token});
}
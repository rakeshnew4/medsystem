import { auth, db } from "hatchable";
import { PRIMARY_ADMIN_EMAIL } from "../lib/authz.js";
// Web Crypto is available in the Hatchable runtime.

export const access="user";
export const methods=["GET","POST","DELETE"];

const ROLES=["admin","doctor","nurse","receptionist","lab","pharmacy","billing"];

export default async function(req,res){
  const user=await auth.getUser(req);
  if(!user)return res.status(401).json({error:"Sign in required"});
  if(String(user.email||'').toLowerCase()!==PRIMARY_ADMIN_EMAIL)return res.status(403).json({error:"Admin role preview is restricted to the primary administrator"});

  const token=req.cookies?.careflow_role_preview;
  if(req.method==="DELETE"){
    if(token)await db.query("DELETE FROM admin_role_preview_sessions WHERE token=$1",[token]);
    res.cookie("careflow_role_preview","",{httpOnly:true,secure:true,sameSite:"lax",maxAge:0,path:"/"});
    return res.json({role:"admin",preview:false});
  }

  if(req.method==="POST"){
    const role=String(req.body?.role||"").toLowerCase();
    if(!ROLES.includes(role))return res.status(400).json({error:"Invalid preview role",roles:ROLES});
    const next=globalThis.crypto.randomUUID()+globalThis.crypto.randomUUID();
    if(token)await db.query("DELETE FROM admin_role_preview_sessions WHERE token=$1",[token]);
    await db.query("INSERT INTO admin_role_preview_sessions(token,admin_user_id,role) VALUES($1,$2,$3)",[next,String(user.id),role]);
    res.cookie("careflow_role_preview",next,{httpOnly:true,secure:true,sameSite:"lax",maxAge:8*60*60*1000,path:"/"});
    return res.json({role,preview:role!=="admin"});
  }

  if(!token)return res.json({role:"admin",preview:false});
  const r=await db.query("SELECT role FROM admin_role_preview_sessions WHERE token=$1 AND admin_user_id=$2 AND expires_at>now()",[token,String(user.id)]);
  const role=r.rows[0]?.role||"admin";
  res.json({role,preview:role!=="admin"});
}
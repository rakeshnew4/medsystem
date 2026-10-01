import { auth } from "hatchable";
import { db } from "../lib/db.js";
import { PRIMARY_ADMIN_EMAIL } from "../lib/authz.js";

export const access="user";
export const methods=["GET","POST","DELETE"];

const ACCOUNTS={
  admin:["admin","0000"],
  receptionist:["reception","1001"],
  nurse:["nurse","1002"],
  doctor:["doctor","1003"],
  lab:["lab","1004"],
  pharmacy:["pharmacy","1005"],
  billing:["billing","1006"]
};
const ROLES=Object.keys(ACCOUNTS);

export default async function(req,res){
  const user=await auth.getUser(req);
  if(!user)return res.status(401).json({error:"Sign in with Hatchable first"});
  if(String(user.email||"").toLowerCase()!==PRIMARY_ADMIN_EMAIL)return res.status(403).json({error:"Role test login is available to the primary administrator only"});
  const token=req.cookies?.careflow_role_session||req.headers?.['x-careflow-role-token']||null;
  if(req.method==="DELETE"){
    if(token)await db.query("DELETE FROM admin_role_preview_sessions WHERE token=$1 AND admin_user_id=$2",[token,String(user.id)]);
    res.cookie("careflow_role_session","",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
    return res.json({role:null});
  }
  if(req.method==="GET"){
    if(!token)return res.json({role:null,roles:ROLES});
    const q=await db.query("SELECT role FROM admin_role_preview_sessions WHERE token=$1 AND admin_user_id=$2 AND expires_at>now()",[token,String(user.id)]);
    return res.json({role:q.rows[0]?.role||null,roles:ROLES});
  }
  const role=String(req.body?.role||"").toLowerCase();
  const username=String(req.body?.username||"").trim().toLowerCase();
  const code=String(req.body?.code||"");
  const account=ACCOUNTS[role];
  if(!account||username!==account[0]||code!==account[1])return res.status(401).json({error:"Invalid role login"});
  const next=globalThis.crypto.randomUUID()+globalThis.crypto.randomUUID();
  if(token)await db.query("DELETE FROM admin_role_preview_sessions WHERE token=$1 AND admin_user_id=$2",[token,String(user.id)]);
  await db.query("INSERT INTO admin_role_preview_sessions(token,admin_user_id,role) VALUES($1,$2,$3)",[next,String(user.id),role]);
  res.cookie("careflow_role_session",next,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:8*60*60*1000});
  return res.json({role,token:next});
}
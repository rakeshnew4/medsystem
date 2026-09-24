import { db } from "../../../lib/db.js";
export const access="public";
export const methods=["POST"];
async function sha256(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
export default async function(req,res){
 const s=String(req.headers?.cookie||"");const part=s.split(";").map(x=>x.trim()).find(x=>x.startsWith("careflow_patient_session="));const raw=part?part.slice("careflow_patient_session=".length):null;
 if(raw)await db.query("DELETE FROM patient_sessions WHERE token_hash=$1",[await sha256(decodeURIComponent(raw))]);
 res.cookie("careflow_patient_session","",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});return res.json({ok:true});
}
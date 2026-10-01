import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const tables=["staff_profiles","permissions","role_permissions","user_permissions"]; const out={};
 for(const t of tables){const r=await db.query("SELECT count(*) AS rows FROM "+t); out[t]=Number(r.rows[0]?.rows||0);}
 return res.json({ok:true,tables:out});
}
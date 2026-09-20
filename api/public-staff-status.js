import { auth, db } from "hatchable";
export const access="public";
export const methods=["GET"];
export default async function(req,res){
  const user=await auth.getUser(req);
  if(!user)return res.json({signed_in:false});
  const r=await db.query("SELECT id,email,display_name,role,active,doctor_id FROM staff_profiles WHERE user_id=$1",[user.id]);
  res.json({signed_in:true,user,staff:r.rows[0]||null});
}
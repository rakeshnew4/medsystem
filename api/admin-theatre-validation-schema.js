import { db } from "../lib/db.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
  try{
    await db.query("ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ",[]);
    await db.query("ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS validated_by TEXT",[]);
    await db.query("CREATE INDEX IF NOT EXISTS idx_theatre_procedures_validated ON theatre_procedures(hospital_id,validated_at)",[]);
    const r=await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='theatre_procedures' AND column_name IN ('validated_at','validated_by') ORDER BY column_name",[]);
    return res.json({ok:true,columns:r.rows});
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e).slice(0,1000)});}
}
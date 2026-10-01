import { db } from "../lib/db.js";

export const access="admin";
export const methods=["POST"];

export default async function(req,res){
  try{
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_pharmacy_dispenses_one_active ON pharmacy_dispenses(hospital_id, medication_id) WHERE medication_id IS NOT NULL AND status='dispensed'");
    const check=await db.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='pharmacy_dispenses' AND indexname='ux_pharmacy_dispenses_one_active'");
    return res.json({ok:check.rows.length===1,index_present:check.rows.length===1});
  }catch(e){
    return res.status(409).json({ok:false,error:String(e?.message||e).slice(0,500)});
  }
}
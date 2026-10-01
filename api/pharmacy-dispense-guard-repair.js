import { db } from "../lib/db.js";

export const access="admin";
export const methods=["POST"];

export default async function(req,res){
  try{
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_pharmacy_dispenses_one_active ON pharmacy_dispenses(hospital_id, medication_id) WHERE medication_id IS NOT NULL AND status='dispensed'");
    await db.query("EXPLAIN INSERT INTO pharmacy_dispenses(hospital_id,medication_id,status) SELECT $1,$2,'dispensed' WHERE false ON CONFLICT (hospital_id,medication_id) WHERE status='dispensed' DO NOTHING",[0,0]);
    return res.json({ok:true,index_present:true});
  }catch(e){
    return res.status(409).json({ok:false,index_present:false,error:String(e?.message||e).slice(0,500)});
  }
}
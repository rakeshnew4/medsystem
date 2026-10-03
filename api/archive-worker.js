import { db } from "../lib/db.js";
import { archiveReports } from "../lib/archive.js";

export const access = "scheduler";
export const schedule = "30 * * * *";

export default async function(req,res){
  const hospitals=await db.query("SELECT id FROM hospitals ORDER BY id");
  const archive=[];
  for(const hospital of hospitals.rows){
    try{
      archive.push({hospital_id:hospital.id,...await archiveReports(hospital.id)});
    }catch(error){
      archive.push({
        hospital_id:hospital.id,
        ok:false,
        error:String(error?.message||error).slice(0,240)
      });
    }
  }
  res.json({
    ok:true,
    scheduled:true,
    archive,
    note:"Archive worker is isolated from WhatsApp reminder delivery."
  });
}
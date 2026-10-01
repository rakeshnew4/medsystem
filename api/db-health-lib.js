import { db } from "../lib/db.js";

export const access = "admin";
export const methods = ["GET"];

export default async function(req,res){
  const started=Date.now();
  try{
    const r=await db.query("SELECT id,name,uhid FROM patients ORDER BY id DESC LIMIT 5",[]);
    res.json({
      ok:true,
      source:"lib-db-external-adapter",
      duration_ms:Date.now()-started,
      row_count:Number(r.rowCount ?? r.rows?.length ?? 0),
      patients:r.rows||[]
    });
  }catch(e){
    res.status(502).json({
      ok:false,
      source:"lib-db-external-adapter",
      duration_ms:Date.now()-started,
      error:String(e?.message||e).slice(0,1000)
    });
  }
}
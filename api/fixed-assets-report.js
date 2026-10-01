import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.assets.manage");
  if(!ctx)return;
  const kind=String(req.query?.kind||"warranty").toLowerCase();
  if(!["warranty","amc"].includes(kind))return res.status(400).json({error:"kind must be warranty or amc"});
  const field=kind==="warranty"?"warranty_expiry":"amc_expiry";
  const from=String(req.query?.from||"").trim();
  const to=String(req.query?.to||"").trim();
  const r=await db.query(
    `SELECT id,asset_code,description,category,serial_number,location,status,purchase_price,current_value,${field} AS expiry_date
     FROM fixed_assets
     WHERE hospital_id=$1 AND ${field} IS NOT NULL
       AND ($2='' OR ${field}>=$2::date)
       AND ($3='' OR ${field}<=$3::date)
     ORDER BY ${field},asset_code
     LIMIT 1000`,
    [ctx.hospitalId,from,to]
  );
  const today=new Date().toISOString().slice(0,10);
  const expired=r.rows.filter(x=>String(x.expiry_date).slice(0,10)<today).length;
  const upcoming=r.rows.length-expired;
  return res.json({kind,from:from||null,to:to||null,total:r.rows.length,expired,upcoming,assets:r.rows});
}
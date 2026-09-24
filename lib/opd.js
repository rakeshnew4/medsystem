import { db } from "./db.js";

export async function hospitalLocalDate(hospitalId, when=new Date()){
  const r=await db.query("SELECT timezone FROM hospitals WHERE id=$1",[hospitalId]);
  const timezone=r.rows[0]?.timezone||"Asia/Kolkata";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(when);
  const get=k=>parts.find(x=>x.type===k)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function allocateOpdToken(hospitalId){
  const tokenDate=await hospitalLocalDate(hospitalId);
  const r=await db.query(
    "INSERT INTO opd_daily_tokens(hospital_id,token_date,last_number) VALUES($1,$2,1) ON CONFLICT (hospital_id,token_date) DO UPDATE SET last_number=opd_daily_tokens.last_number+1,updated_at=now() RETURNING last_number",
    [hospitalId,tokenDate]
  );
  const tokenNumber=Number(r.rows[0].last_number);
  return {tokenDate,tokenNumber,token:`T${String(tokenNumber).padStart(3,"0")}`};
}
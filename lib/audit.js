import { db } from "./db.js";

export async function logAudit(ctx, { action, entityType, entityId=null, details={} }){
  try{
    const actor = String(ctx?.user?.email || ctx?.user?.id || ctx?.staff?.email || "system");
    await db.query(
      "INSERT INTO audit_logs(hospital_id,actor,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)",
      [ctx.hospitalId, actor, action, entityType, entityId==null?null:String(entityId), JSON.stringify(details||{})]
    );
  }catch(e){
    console.error("audit_log_failed", e?.message||e);
  }
}
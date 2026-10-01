import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
  await db.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`);
  await db.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_hospital_entity_created ON audit_logs(hospital_id,entity_type,entity_id,created_at DESC,id DESC)");
  const r=await db.query("SELECT to_regclass('public.audit_logs') AS audit_logs");
  res.json({ok:true,rows:r.rows});
}
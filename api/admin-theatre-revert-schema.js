import { db } from "../lib/db.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
  await db.query("ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS validation_reverted_at TIMESTAMPTZ");
  await db.query("ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS validation_reverted_by TEXT");
  await db.query("ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS validation_revert_reason TEXT");
  await db.query("CREATE INDEX IF NOT EXISTS idx_theatre_procedures_validation_reverted ON theatre_procedures(hospital_id,validation_reverted_at)");
  await db.query("INSERT INTO permissions(permission_key,label,category,description) VALUES ($1,$2,$3,$4) ON CONFLICT (permission_key) DO UPDATE SET label=EXCLUDED.label,category=EXCLUDED.category,description=EXCLUDED.description",["action.theatre.validation_revert","Revert Theatre surgery validation","Actions","Reopen a validated Theatre procedure for controlled clinical/financial corrections"]);
  await db.query("INSERT INTO role_permissions(role,permission_key,allowed) VALUES ($1,$2,true) ON CONFLICT (role,permission_key) DO UPDATE SET allowed=true",["admin","action.theatre.validation_revert"]);
  await db.query("INSERT INTO role_permissions(role,permission_key,allowed) VALUES ($1,$2,true) ON CONFLICT (role,permission_key) DO UPDATE SET allowed=true",["billing","action.theatre.validation_revert"]);
  const r=await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='theatre_procedures' AND column_name IN ('validation_reverted_at','validation_reverted_by','validation_revert_reason') ORDER BY column_name");
  return res.json({ok:true,columns:r.rows});
}
import { db } from "../lib/db.js";
export const access="admin";
export const methods=["POST"];

export default async function(req,res){
  await db.query(`CREATE TABLE IF NOT EXISTS theatre_procedure_team (
    id BIGSERIAL PRIMARY KEY,
    hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    procedure_id BIGINT NOT NULL REFERENCES theatre_procedures(id) ON DELETE CASCADE,
    staff_id BIGINT NOT NULL REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    team_role TEXT NOT NULL,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(hospital_id,procedure_id,staff_id,team_role)
  )`);
  await db.query("CREATE INDEX IF NOT EXISTS idx_theatre_team_procedure ON theatre_procedure_team(hospital_id,procedure_id)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_theatre_team_staff ON theatre_procedure_team(hospital_id,staff_id)");
  res.json({ok:true});
}
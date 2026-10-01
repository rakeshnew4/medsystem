import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
  const a=await db.query("SELECT current_schema() AS schema");
  const b=await db.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_name='audit_logs'");
  res.json({schema:a.rows,tables:b.rows});
}
import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
  const r=await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('pharmacy_stock','pharmacy_stock_transactions') ORDER BY table_name",[]);
  return res.json({tables:r.rows.map(x=>x.table_name)});
}
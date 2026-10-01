import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const a=await db.query("SELECT current_schema() AS schema_name");
 const b=await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='pharmacy_stock_transfers' ORDER BY ordinal_position");
 const c=await db.query("SELECT count(*) AS rows FROM pharmacy_stock_transfers");
 return res.json({schema:a.rows,columns:b.rows,rows:c.rows});
}
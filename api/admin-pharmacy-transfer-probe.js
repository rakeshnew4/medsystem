import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const a=await db.query("SELECT n.nspname AS schema_name,c.relname, a.attname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relname='pharmacy_stock_transfers' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum");
 const b=await db.query("SELECT count(*) AS rows FROM pharmacy_stock_transfers");
 return res.json({columns:a.rows,rows:b.rows});
}
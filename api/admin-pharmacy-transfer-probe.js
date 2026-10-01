import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const t=await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='pharmacy_stock_transfers' ORDER BY ordinal_position");
 const x=await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='pharmacy_stock_transactions' ORDER BY ordinal_position");
 return res.json({transfer_columns:t.rows,transaction_columns:x.rows});
}
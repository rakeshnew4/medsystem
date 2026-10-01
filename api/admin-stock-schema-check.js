import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
  const a=await db.query("SELECT count(*)::int AS n FROM pharmacy_stock",[]); const b=await db.query("SELECT count(*)::int AS n FROM pharmacy_stock_transactions",[]);
  return res.json({pharmacy_stock_rows:a.rows[0].n,pharmacy_stock_transaction_rows:b.rows[0].n});
}
import { db } from "../lib/db.js";

export const access="admin";
export const methods=["GET"];

export default async function(req,res){
  const checks=[];
  async function check(id,sql,fn){
    try{
      const r=await db.query(sql);
      const value=fn(r.rows);
      checks.push({id,pass:value===0,value});
    }catch(error){
      checks.push({id,pass:false,error:String(error?.message||error).slice(0,300)});
    }
  }

  await check("invoice_paid_bounds",
    "SELECT count(*) AS n FROM invoices WHERE paid < 0 OR paid > total",
    r=>Number(r[0]?.n||0));

  await check("invoice_status_consistency",
    "SELECT count(*) AS n FROM invoices WHERE status NOT IN ('paid','partial','unpaid') OR (paid=0 AND status<>'unpaid') OR (paid>0 AND paid<total AND status<>'partial') OR (paid>=total AND status<>'paid')",
    r=>Number(r[0]?.n||0));

  await check("invoice_item_amount_integrity",
    "SELECT count(*) AS n FROM invoice_items WHERE quantity <= 0 OR unit_price < 0 OR amount <> quantity*unit_price",
    r=>Number(r[0]?.n||0));

  await check("invoice_total_matches_items",
    "SELECT count(*) AS n FROM invoices i WHERE ABS(i.subtotal-COALESCE((SELECT SUM(ii.amount) FROM invoice_items ii WHERE ii.invoice_id=i.id),0)) > 0.01",
    r=>Number(r[0]?.n||0));

  await check("payment_rows_positive",
    "SELECT count(*) AS n FROM invoice_payments WHERE amount <= 0",
    r=>Number(r[0]?.n||0));

  await check("payment_sum_not_above_invoice",
    "SELECT count(*) AS n FROM invoices i WHERE COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id=i.id AND p.hospital_id=i.hospital_id),0) > i.paid + 0.01",
    r=>Number(r[0]?.n||0));

  await check("payment_sum_not_above_total",
    "SELECT count(*) AS n FROM invoices i WHERE COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id=i.id AND p.hospital_id=i.hospital_id),0) > i.total + 0.01",
    r=>Number(r[0]?.n||0));

  await check("payment_invoice_hospital_integrity",
    "SELECT count(*) AS n FROM invoice_payments p LEFT JOIN invoices i ON i.id=p.invoice_id AND i.hospital_id=p.hospital_id WHERE i.id IS NULL",
    r=>Number(r[0]?.n||0));

  // Legacy balances are deliberately reported separately: they predate the immutable
  // payment ledger and cannot be safely reconstructed without source payment metadata.
  await check("legacy_payment_ledger_gap",
    "SELECT count(*) AS n FROM invoices i WHERE i.paid > 0 AND NOT EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_id=i.id)",
    r=>Number(r[0]?.n||0));

  const passed=checks.filter(x=>x.pass).length;
  res.json({ok:passed===checks.length,passed,total:checks.length,checks,authenticated_e2e_required:true});
}
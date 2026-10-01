import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.pharmacy.manage"); if(!ctx)return;
 if(req.method==="GET"){
  const r=await db.query("SELECT * FROM pharmacy_stock WHERE hospital_id=$1 AND active=true ORDER BY medicine_name, expiry_date NULLS LAST, batch_no",[ctx.hospitalId]);
  return res.json(r.rows);
 }
 const b=req.body||{};
 if(b.action!=="receive")return res.status(400).json({error:"Unsupported stock action"});
 const name=String(b.medicine_name||"").trim(), batch=String(b.batch_no||"").trim(), qty=Number(b.quantity);
 if(!name||!batch||!Number.isFinite(qty)||qty<=0)return res.status(400).json({error:"medicine_name, batch_no and positive quantity are required"});
 const r=await db.query("INSERT INTO pharmacy_stock(hospital_id,medicine_name,batch_no,expiry_date,quantity,reorder_level,unit) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(hospital_id,medicine_name,batch_no) DO UPDATE SET quantity=pharmacy_stock.quantity+EXCLUDED.quantity,expiry_date=EXCLUDED.expiry_date,reorder_level=EXCLUDED.reorder_level,unit=EXCLUDED.unit,updated_at=CURRENT_TIMESTAMP RETURNING *",[ctx.hospitalId,name,batch,b.expiry_date||null,qty,Number(b.reorder_level||0),String(b.unit||"unit")]);
 await db.query("INSERT INTO pharmacy_stock_transactions(hospital_id,stock_id,transaction_type,quantity,performed_by,notes) VALUES($1,$2,'receipt',$3,$4,$5)",[ctx.hospitalId,r.rows[0].id,qty,ctx.user.email,b.notes||null]);
 return res.json(r.rows[0]);
}
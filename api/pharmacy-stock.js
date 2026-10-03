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
 const reorderLevel=b.reorder_level==null||b.reorder_level===""?0:Number(b.reorder_level);
 const unit=String(b.unit||"unit").trim();
 const idempotencyKey=String(b.idempotency_key||"").trim();
 let expiryDate=null;
 if(b.expiry_date!=null&&String(b.expiry_date).trim()!=="") expiryDate=String(b.expiry_date).trim();
 if(!name||!batch||!Number.isFinite(qty)||qty<=0||!Number.isFinite(reorderLevel)||reorderLevel<0||!unit)return res.status(400).json({error:"medicine_name, batch_no, positive quantity, non-negative reorder_level and unit are required"});
 if(idempotencyKey.length>160)return res.status(400).json({error:"idempotency_key is too long"});
 if(expiryDate&&!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate))return res.status(400).json({error:"expiry_date must use YYYY-MM-DD"});
 let r;
 try {
  const existing=await db.query("SELECT * FROM pharmacy_stock WHERE hospital_id=$1 AND medicine_name=$2 AND batch_no=$3 LIMIT 1",[ctx.hospitalId,name,batch]);
  if(existing.rows[0]){
   const before=Number(existing.rows[0].quantity||0), after=before+qty;
   await db.transaction([
    {sql:"UPDATE pharmacy_stock SET quantity=$1,reorder_level=$2,unit=$3,expiry_date=$4,active=true,updated_at=CURRENT_TIMESTAMP WHERE id=$5",params:[after,reorderLevel,unit,expiryDate,existing.rows[0].id]},
    {sql:"INSERT INTO pharmacy_stock_transactions(hospital_id,stock_id,transaction_type,quantity,quantity_before,quantity_after,performed_by,notes) VALUES($1,$2,'receipt',$3,$4,$5,$6,$7)",params:[ctx.hospitalId,existing.rows[0].id,qty,before,after,ctx.user.email,b.notes||null]}
   ]);
   r={rows:[{...existing.rows[0],quantity:after,reorder_level:reorderLevel,unit,expiry_date:expiryDate,active:true}]};
  }else{
   const ins=await db.query("INSERT INTO pharmacy_stock(hospital_id,medicine_name,batch_no,expiry_date,quantity,reorder_level,unit,active,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *",[ctx.hospitalId,name,batch,expiryDate,qty,reorderLevel,unit]);
   const row=ins.rows[0];
   await db.query("INSERT INTO pharmacy_stock_transactions(hospital_id,stock_id,transaction_type,quantity,quantity_before,quantity_after,performed_by,notes) VALUES($1,$2,'receipt',$3,0,$4,$5,$6)",[ctx.hospitalId,row.id,qty,qty,ctx.user.email,b.notes||null]);
   r={rows:[row]};
  }
 } catch(e) {
  if(e?.code==="23505" && idempotencyKey)return res.status(409).json({error:"This receipt idempotency key was already used; refresh stock before retrying."});
  console.error("[pharmacy-stock] receipt failed",String(e?.message||e));
  return res.status(500).json({error:"Stock receipt failed",detail:String(e?.message||e)});
 }
 return res.json(r.rows[0]);
}
import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
export const access="user";
export const methods=["GET","POST","PUT"];

export default async function(req,res){
 const ctx=await requirePermission(req,res,"action.assets.manage");
 if(!ctx)return;

 if(req.method==="GET"){
  const id=Number(req.query?.id||0);
  if(id){
   const a=await db.query("SELECT * FROM fixed_assets WHERE id=$1 AND hospital_id=$2",[id,ctx.hospitalId]);
   if(!a.rows[0])return res.status(404).json({error:"Asset not found"});
   const h=await db.query("SELECT * FROM fixed_asset_transfers WHERE asset_id=$1 AND hospital_id=$2 ORDER BY transferred_at DESC",[id,ctx.hospitalId]);
   return res.json({...a.rows[0],transfer_history:h.rows});
  }
  const q=String(req.query?.q||"").trim();
  const r=await db.query("SELECT * FROM fixed_assets WHERE hospital_id=$1 AND ($2='' OR asset_code ILIKE '%'||$2||'%' OR description ILIKE '%'||$2||'%' OR serial_number ILIKE '%'||$2||'%') ORDER BY asset_code LIMIT 500",[ctx.hospitalId,q]);
  return res.json(r.rows);
 }

 const b=req.body||{};
 if(req.method==="POST"){
  if(b.action==="transfer"){
   const id=Number(b.asset_id||0), toLocation=String(b.to_location||"").trim();
   if(!id||!toLocation)return res.status(400).json({error:"asset_id and to_location are required"});
   const toStaff=b.to_custodian_staff_id?Number(b.to_custodian_staff_id):null;
   if(toStaff){
    const s=await db.query("SELECT id FROM staff_profiles WHERE id=$1 AND hospital_id=$2 AND active=true",[toStaff,ctx.hospitalId]);
    if(!s.rows[0])return res.status(404).json({error:"Destination custodian not found"});
   }
   const tx=await db.transaction([{
    sql:"WITH locked AS (SELECT * FROM fixed_assets WHERE id=$1 AND hospital_id=$2 FOR UPDATE), inserted AS (INSERT INTO fixed_asset_transfers(hospital_id,asset_id,from_location,to_location,from_custodian_staff_id,to_custodian_staff_id,reason,transferred_by) SELECT hospital_id,id,location,$3,custodian_staff_id,$4,$5,$6 FROM locked WHERE status='active' AND (location IS DISTINCT FROM $3 OR custodian_staff_id IS DISTINCT FROM $4) RETURNING *) UPDATE fixed_assets a SET location=$3,custodian_staff_id=$4,updated_at=now() FROM inserted i WHERE a.id=i.asset_id AND a.hospital_id=$2 RETURNING a.*,i.from_location,i.to_location,i.from_custodian_staff_id,i.to_custodian_staff_id",
    params:[id,ctx.hospitalId,toLocation,toStaff,String(b.reason||"").trim()||null,ctx.user.email]
   }]);
   const row=tx.results?.[0]?.rows?.[0];
   if(!row)return res.status(409).json({error:"Asset not found, inactive, or changed before transfer"});
   await logWorkflowEvent(ctx,{eventType:"fixed_asset_transferred",stage:"assets",entityType:"fixed_asset",entityId:id,metadata:{from_location:row.from_location,to_location:row.to_location,from_custodian_staff_id:row.from_custodian_staff_id,to_custodian_staff_id:row.to_custodian_staff_id}});
   delete row.from_location; delete row.to_location; delete row.from_custodian_staff_id; delete row.to_custodian_staff_id;
   return res.json(row);
  }
  const code=String(b.asset_code||"").trim(), desc=String(b.description||"").trim(), category=String(b.category||"").trim();
  if(!code||!desc||!category)return res.status(400).json({error:"asset_code, description and category are required"});
  const status=String(b.status||"active").trim().toLowerCase();
  if(!["active","inactive","disposed","retired"].includes(status))return res.status(400).json({error:"Invalid asset status"});
  const initialCustodian=b.custodian_staff_id?Number(b.custodian_staff_id):null;
  if(initialCustodian){
   const s=await db.query("SELECT id FROM staff_profiles WHERE id=$1 AND hospital_id=$2 AND active=true",[initialCustodian,ctx.hospitalId]);
   if(!s.rows[0])return res.status(404).json({error:"Custodian not found"});
  }
  const price=Number(b.purchase_price||0), rate=Number(b.depreciation_rate||0);
  if(!Number.isFinite(price)||price<0||!Number.isFinite(rate)||rate<0||rate>100)return res.status(400).json({error:"Invalid purchase price or depreciation rate"});
  const r=await db.query("INSERT INTO fixed_assets(hospital_id,asset_code,description,category,serial_number,purchase_date,purchase_price,depreciation_method,depreciation_rate,useful_life_years,current_value,location,custodian_staff_id,status,warranty_expiry,amc_expiry,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *",[ctx.hospitalId,code,desc,category,String(b.serial_number||"").trim()||null,b.purchase_date||null,price,b.depreciation_method||"straight_line",rate,b.useful_life_years?Number(b.useful_life_years):null,b.current_value==null?price:Number(b.current_value),String(b.location||"").trim()||null,initialCustodian,status,b.warranty_expiry||null,b.amc_expiry||null,String(b.notes||"").trim()||null,ctx.user.email]);
  await logWorkflowEvent(ctx,{eventType:"fixed_asset_created",stage:"assets",entityType:"fixed_asset",entityId:r.rows[0].id,metadata:{asset_code:code,category}});
  return res.status(201).json(r.rows[0]);
 }

 const id=Number(b.id||0);
 if(!id)return res.status(400).json({error:"Asset id is required"});
 const status=String(b.status||"active").trim().toLowerCase();
 if(!["active","inactive","disposed","retired"].includes(status))return res.status(400).json({error:"Invalid asset status"});
 const price=Number(b.purchase_price||0), rate=Number(b.depreciation_rate||0);
 if(!Number.isFinite(price)||price<0||!Number.isFinite(rate)||rate<0||rate>100)return res.status(400).json({error:"Invalid purchase price or depreciation rate"});
 const r=await db.query("UPDATE fixed_assets SET description=COALESCE(NULLIF($1,''),description),category=COALESCE(NULLIF($2,''),category),serial_number=$3,purchase_date=$4,purchase_price=$5,depreciation_method=$6,depreciation_rate=$7,useful_life_years=$8,current_value=$9,status=$10,warranty_expiry=$11,amc_expiry=$12,notes=$13,updated_at=now() WHERE id=$14 AND hospital_id=$15 RETURNING *",[String(b.description||"").trim(),String(b.category||"").trim(),String(b.serial_number||"").trim()||null,b.purchase_date||null,price,b.depreciation_method||"straight_line",rate,b.useful_life_years?Number(b.useful_life_years):null,b.current_value==null?price:Number(b.current_value),status,b.warranty_expiry||null,b.amc_expiry||null,String(b.notes||"").trim()||null,id,ctx.hospitalId]);
 if(!r.rows[0])return res.status(404).json({error:"Asset not found"});
 await logWorkflowEvent(ctx,{eventType:"fixed_asset_updated",stage:"assets",entityType:"fixed_asset",entityId:id,metadata:{status}});
 return res.json(r.rows[0]);
}
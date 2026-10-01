import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.assets.manage");
  if(!ctx)return;
  const kind=String(req.query?.kind||"transfers").toLowerCase();
  if(!["transfers","depreciation"].includes(kind))return res.status(400).json({error:"kind must be transfers or depreciation"});
  const from=String(req.query?.from||"").trim();
  const to=String(req.query?.to||"").trim();

  if(kind==="transfers"){
    const r=await db.query(
      `SELECT t.id,t.asset_id,a.asset_code,a.description,a.category,
              t.from_location,t.to_location,t.from_custodian_staff_id,t.to_custodian_staff_id,
              t.reason,t.transferred_by,t.transferred_at
       FROM fixed_asset_transfers t
       JOIN fixed_assets a ON a.id=t.asset_id AND a.hospital_id=t.hospital_id
       WHERE t.hospital_id=$1
         AND ($2='' OR t.transferred_at::date>=$2::date)
         AND ($3='' OR t.transferred_at::date<=$3::date)
       ORDER BY t.transferred_at DESC,t.id DESC LIMIT 2000`,
      [ctx.hospitalId,from,to]
    );
    return res.json({kind,from:from||null,to:to||null,total:r.rows.length,transfers:r.rows});
  }

  const r=await db.query(
    `SELECT id,asset_code,description,category,serial_number,purchase_date,purchase_price,
            depreciation_method,depreciation_rate,useful_life_years,current_value,
            location,status
     FROM fixed_assets
     WHERE hospital_id=$1
       AND ($2='' OR purchase_date<=$2::date)
     ORDER BY purchase_date NULLS LAST,asset_code LIMIT 2000`,
    [ctx.hospitalId,to]
  );
  const asOf=to||new Date().toISOString().slice(0,10);
  const out=r.rows.map(a=>{
    const price=Number(a.purchase_price||0), rate=Number(a.depreciation_rate||0)/100;
    let years=0;
    if(a.purchase_date){
      const ms=new Date(asOf+"T00:00:00")-new Date(String(a.purchase_date).slice(0,10)+"T00:00:00");
      years=Math.max(0,ms/31557600000);
    }
    let book=price;
    if(a.depreciation_method==="straight_line") book=Math.max(0,price-(price*rate*years));
    else if(a.depreciation_method==="declining_balance") book=Math.max(0,price*Math.pow(Math.max(0,1-rate),years));
    else if(a.depreciation_method==="none") book=price;
    if(a.useful_life_years) book=Math.max(book,0);
    return {...a,as_of:asOf,elapsed_years:Number(years.toFixed(2)),accumulated_depreciation:Number(Math.max(0,price-book).toFixed(2)),calculated_book_value:Number(book.toFixed(2))};
  });
  return res.json({kind,as_of:asOf,total:out.length,assets:out});
}
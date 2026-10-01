import { db } from "../lib/db.js";

export const access="admin";
export const methods=["GET"];

export default async function(req,res){
  const checks = await Promise.all([
    db.query("SELECT count(*)::int AS n FROM fixed_assets WHERE status NOT IN ('active','inactive','disposed','retired')"),
    db.query("SELECT count(*)::int AS n FROM fixed_assets WHERE purchase_price < 0 OR depreciation_rate < 0 OR depreciation_rate > 100"),
    db.query("SELECT count(*)::int AS n FROM fixed_assets a LEFT JOIN staff_profiles s ON s.id=a.custodian_staff_id WHERE a.custodian_staff_id IS NOT NULL AND (s.id IS NULL OR s.hospital_id<>a.hospital_id OR s.active<>true)"),
    db.query("SELECT count(*)::int AS n FROM fixed_asset_transfers t LEFT JOIN fixed_assets a ON a.id=t.asset_id WHERE a.id IS NULL OR a.hospital_id<>t.hospital_id"),
    db.query("SELECT count(*)::int AS n FROM fixed_asset_transfers t JOIN fixed_assets a ON a.id=t.asset_id WHERE t.hospital_id=a.hospital_id AND (t.to_location IS DISTINCT FROM a.location OR t.to_custodian_staff_id IS DISTINCT FROM a.custodian_staff_id) AND t.id=(SELECT t2.id FROM fixed_asset_transfers t2 WHERE t2.asset_id=t.asset_id AND t2.hospital_id=t.hospital_id ORDER BY t2.transferred_at DESC,t2.id DESC LIMIT 1)")
  ]);
  const names=["invalid_status","invalid_financial_values","invalid_custodian","cross_hospital_or_orphan_transfer","latest_transfer_not_reflected_on_asset"];
  const violations=Object.fromEntries(names.map((n,i)=>[n,checks[i].rows[0].n]));
  const total=Object.values(violations).reduce((a,b)=>a+b,0);
  return res.json({ok:total===0,total_violations:total,violations});
}
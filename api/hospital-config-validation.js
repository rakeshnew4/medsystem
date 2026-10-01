import { db } from "../lib/db.js";

export const access="admin";
export const methods=["GET"];

export default async function(req,res){
  const checks=await Promise.all([
    db.query("SELECT count(*)::int AS n FROM hospital_services s LEFT JOIN departments d ON d.id=s.department_id WHERE s.department_id IS NOT NULL AND (d.id IS NULL OR d.hospital_id<>s.hospital_id)"),
    db.query("SELECT count(*)::int AS n FROM hospital_working_hours WHERE day_of_week<0 OR day_of_week>6"),
    db.query("SELECT count(*)::int AS n FROM hospital_working_hours WHERE is_open=true AND (start_time IS NULL OR end_time IS NULL OR start_time>=end_time)"),
    db.query("SELECT count(*)::int AS n FROM hospital_settings WHERE setting_key IS NULL OR btrim(setting_key)=''"),
    db.query("SELECT count(*)::int AS n FROM hospital_features WHERE feature_key IS NULL OR btrim(feature_key)=''"),
    db.query("SELECT count(*)::int AS n FROM hospital_modules WHERE module_key IS NULL OR btrim(module_key)=''"),
    db.query("SELECT count(*)::int AS n FROM hospital_labels WHERE label_key IS NULL OR btrim(label_key)=''")
  ]);
  const names=[
    "service_cross_hospital_department",
    "invalid_working_hour_day",
    "invalid_open_working_hours",
    "blank_setting_key",
    "blank_feature_key",
    "blank_module_key",
    "blank_label_key"
  ];
  const violations=Object.fromEntries(names.map((n,i)=>[n,checks[i].rows[0].n]));
  const total=Object.values(violations).reduce((a,b)=>a+b,0);
  return res.json({ok:total===0,total_violations:total,checks:names.length,violations});
}
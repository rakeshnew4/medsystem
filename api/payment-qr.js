import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET"];

function money(v){
  const n=Number(v);
  return Number.isFinite(n)&&n>=0?n.toFixed(2):"0.00";
}

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.appointment.create");
  if(!ctx)return;

  const appointmentId=Number(req.query?.appointment_id||0);
  if(!appointmentId)return res.status(400).json({error:"appointment_id is required"});

  const q=await db.query(
    `SELECT a.id,a.patient_id,a.doctor_id,a.appointment_date,a.appointment_time,a.status,
            p.name AS patient_name,p.phone,
            d.name AS doctor_name,d.consultation_fee,
            h.name AS hospital_name
     FROM appointments a
     JOIN patients p ON p.id=a.patient_id
     JOIN doctors d ON d.id=a.doctor_id
     JOIN hospitals h ON h.id=a.hospital_id
     WHERE a.id=$1 AND a.hospital_id=$2
     LIMIT 1`,
    [appointmentId,ctx.hospitalId]
  );
  const ap=q.rows[0];
  if(!ap)return res.status(404).json({error:"Appointment not found"});

  const cfg=await db.query(
    "SELECT setting_value FROM hospital_settings WHERE hospital_id=$1 AND setting_key='billing' LIMIT 1",
    [ctx.hospitalId]
  );
  const billing=cfg.rows[0]?.setting_value||{};
  const gateway=billing.payment_gateway||"upi";
  const amount=money(billing.appointment_fee_override ?? ap.consultation_fee ?? 0);
  const reference="CF-APT-"+ap.id;
  const merchantName=String(billing.merchant_name||ap.hospital_name||"CareFlow").slice(0,60);

  let payload="";
  let paymentMode=gateway;

  // Gateway-ready: if a gateway payment URL/template is configured,
  // encode that URL in the QR. Replace these placeholders server-side.
  if(billing.payment_url_template){
    payload=String(billing.payment_url_template)
      .replaceAll("{amount}",encodeURIComponent(amount))
      .replaceAll("{appointment_id}",encodeURIComponent(String(ap.id)))
      .replaceAll("{patient_id}",encodeURIComponent(String(ap.patient_id)))
      .replaceAll("{reference}",encodeURIComponent(reference));
  }else if(billing.upi_id){
    const params=new URLSearchParams({
      pa:String(billing.upi_id),
      pn:merchantName,
      am:amount,
      cu:"INR",
      tn:"Appointment "+reference
    });
    payload="upi://pay?"+params.toString();
    paymentMode="upi";
  }else{
    return res.status(409).json({
      error:"Payment QR is not configured yet",
      setup:{
        payment_gateway:"upi",
        message:"Set billing.payment_gateway and billing.upi_id, or billing.payment_url_template."
      }
    });
  }

  res.json({
    ok:true,
    appointment_id:ap.id,
    patient_id:ap.patient_id,
    patient_name:ap.patient_name,
    doctor_name:ap.doctor_name,
    amount,
    currency:"INR",
    reference,
    payment_mode:paymentMode,
    payload
  });
}
import { admin, browser } from "hatchable";
import { db } from "../lib/db.js";
import { reviewScreenshot } from "../lib/groq-vision.js";
import { litellmChat } from "../lib/llm.js";

export const access="admin";
export const methods=["GET","POST"];

async function routeCheck(path) {
  try {
    const r=await fetch("https://hospital-ai.hatchable.site"+path);
    return {path,status:r.status,blocked:r.status===401};
  } catch(e) { return {path,status:0,blocked:false,error:e.message}; }
}

export default async function(req,res){
  if(!(await admin.require(req,res)))return;
  try{
    const hospital=(await db.query("SELECT id,name FROM hospitals ORDER BY id LIMIT 1")).rows[0]||null;
    const [dupes,occupied,assignments,discharged] = await Promise.all([
      db.query("SELECT patient_id,count(*)::int AS n FROM admissions WHERE hospital_id=$1 AND discharged_at IS NULL GROUP BY patient_id HAVING count(*)>1",[hospital?.id||0]),
      db.query("SELECT count(*)::int AS n FROM beds WHERE hospital_id=$1 AND status='occupied' AND NOT EXISTS (SELECT 1 FROM admissions a WHERE a.hospital_id=beds.hospital_id AND a.bed_id=beds.id AND a.discharged_at IS NULL)",[hospital?.id||0]),
      db.query("SELECT count(*)::int AS n FROM admissions a WHERE a.hospital_id=$1 AND a.discharged_at IS NULL AND a.bed_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bed_assignments ba WHERE ba.hospital_id=a.hospital_id AND ba.admission_id=a.id AND ba.bed_id=a.bed_id AND ba.released_at IS NULL)",[hospital?.id||0]),
      db.query("SELECT count(*)::int AS n FROM admissions a JOIN beds b ON b.id=a.bed_id AND b.hospital_id=a.hospital_id WHERE a.hospital_id=$1 AND a.discharged_at IS NOT NULL AND b.status='occupied'",[hospital?.id||0])
    ]);
    const guards=await Promise.all(["/api/beds","/api/ipd","/api/discharge"].map(routeCheck));
    const html=await browser.html("https://hospital-ai.hatchable.site");
    const publicUi={
      title:html.includes("CareFlow"),
      staffLoginVisible:html.includes("Staff Portal")||html.includes("Sign in"),
      protectedStaffUiHidden:!html.includes("Beds & admissions")
    };
    let llm={configured:!!process.env.LITELLM_API_KEY&&!!process.env.LITELLM_URL&&!!process.env.LITELLM_MODEL,ok:false,error:null};
    if(llm.configured){
      try{
        const answer=await litellmChat({system:"Return exactly LITELLM_OK.",user:"Health check. Return exactly LITELLM_OK.",maxTokens:40,temperature:0});
        llm.ok=!!String(answer||"").trim();
      }catch(e){llm.error=e.message||"LiteLLM health check failed"}
    }
    const ai=await reviewScreenshot({
      url:"https://hospital-ai.hatchable.site",
      prompt:"Review the CareFlow hospital operations home screen specifically for navigation clarity, staff workflow visibility, and whether the interface exposes the inpatient/bed workflow clearly. Flag missing or confusing UI controls."
    });
    res.json({
      ok:dupes.rows.length===0&&Number(occupied.rows[0]?.n||0)===0&&Number(assignments.rows[0]?.n||0)===0&&Number(discharged.rows[0]?.n||0)===0&&guards.every(x=>x.blocked)&&publicUi.title&&publicUi.staffLoginVisible&&publicUi.protectedStaffUiHidden&&llm.ok,
      hospital,
      invariants:{duplicate_active_admissions:dupes.rows,orphan_occupied_beds:Number(occupied.rows[0]?.n||0),active_admissions_without_current_assignment:Number(assignments.rows[0]?.n||0),discharged_admissions_on_occupied_bed:Number(discharged.rows[0]?.n||0)},
      route_guards:guards,
      public_ui:publicUi,
      protected_staff_ui_note:"Browser visual review is unauthenticated by design; authenticated staff UI remains a separate E2E gate.",
      ai_backends:{groq_configured:!!process.env.GROQ_API_KEY,groq_vision_reviewed:true,litellm:llm},
      visual_review:ai
    });
  }catch(e){res.status(500).json({error:e.message||"IPD validation failed"})}
}
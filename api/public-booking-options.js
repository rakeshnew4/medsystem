import { db } from "hatchable";
export const access="public";
export const methods=["GET","POST"];

const specialtyRules=[
  {terms:["skin","rash","acne","itch","pimple","hair","allergy"],specialty:"Dermatology",reason:"Skin, hair or related concerns"},
  {terms:["tooth","teeth","gum","dental","jaw"],specialty:"Dentistry",reason:"Dental or oral concerns"},
  {terms:["child","baby","kid","infant","pediatric"],specialty:"Pediatrics",reason:"Child health"},
  {terms:["pregnan","period","menstrual","pcos","ovary","gyne","pregnancy"],specialty:"Gynecology",reason:"Women's health"},
  {terms:["bone","joint","knee","back","shoulder","fracture","arthritis"],specialty:"Orthopedics",reason:"Bone, joint or movement concerns"},
  {terms:["eye","vision","blur","glasses"],specialty:"Ophthalmology",reason:"Eye or vision concerns"},
  {terms:["ear","nose","throat","sinus","hearing"],specialty:"ENT",reason:"Ear, nose or throat concerns"},
  {terms:["heart","chest","blood pressure","hypertension"],specialty:"Cardiology",reason:"Heart or blood-pressure concern"},
  {terms:["diabetes","thyroid","hormone"],specialty:"Endocrinology",reason:"Hormonal or metabolic concern"},
  {terms:["stomach","gastric","acidity","abdomen","diarrhea","constipation","vomit"],specialty:"Gastroenterology",reason:"Digestive concern"},
  {terms:["cough","cold","fever","breath","asthma","lung"],specialty:"General Medicine",reason:"General medical concern"},
  {terms:["headache","migraine","seizure","nerve","neuropathy"],specialty:"Neurology",reason:"Neurological concern"}
];

function recommend(problem){
  const text=String(problem||"").toLowerCase();
  const hit=specialtyRules.find(r=>r.terms.some(t=>text.includes(t)));
  return hit||{specialty:"General Medicine",reason:"A general medical consultation is a suitable starting point"};
}

async function hospital(){
  const h=await db.query("SELECT id,name FROM hospitals ORDER BY id LIMIT 1");
  return h.rows[0]||null;
}

export default async function(req,res){
  const h=await hospital();
  if(!h)return res.status(404).json({error:"Hospital is not configured"});
  const problem=String(req.query?.problem||req.body?.problem||"").trim();
  const recommendation=recommend(problem);
  const doctors=await db.query("SELECT id,name,specialty,display_room FROM doctors WHERE hospital_id=$1 AND active=true ORDER BY name",[h.id]);
  const matching=doctors.rows.filter(d=>String(d.specialty||"").toLowerCase()===recommendation.specialty.toLowerCase());
  const general=doctors.rows.filter(d=>/general/i.test(String(d.specialty||"")));
  const suggested=(matching.length?matching:general.length?general:doctors.rows).slice(0,5);
  res.json({
    hospital:h,
    recommendation:{
      type:"routing_suggestion",
      specialty:recommendation.specialty,
      reason:recommendation.reason,
      disclaimer:"This is an appointment-routing suggestion, not a diagnosis. The hospital team can change the assigned doctor."
    },
    general_option:{label:"General consultation",description:"Choose this if you are not sure which department you need."},
    doctors:suggested,
    all_specialties:[...new Set(doctors.rows.map(d=>d.specialty).filter(Boolean))].sort()
  });
}
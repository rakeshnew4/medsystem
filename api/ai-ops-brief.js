import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
import { litellmChat } from "../lib/llm.js";
export const access="user";
export const methods=["POST"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.ai.use"); if(!ctx)return;
  try{
    const hid=ctx.hospitalId;
    const [ap,vis,queue,follow,bill,noShow,staff]=await Promise.all([
      db.query("SELECT count(*)::int n FROM appointments WHERE hospital_id=$1 AND appointment_date=current_date AND status<>'cancelled'",[hid]),
      db.query("SELECT count(*)::int n FROM doctor_visits WHERE hospital_id=$1 AND started_at>=current_date",[hid]),
      db.query("SELECT stage,count(*)::int n FROM queue_entries WHERE hospital_id=$1 GROUP BY stage ORDER BY stage",[hid]),
      db.query("SELECT count(*)::int n FROM followups WHERE hospital_id=$1 AND due_date<=current_date AND status='due'",[hid]),
      db.query("SELECT coalesce(sum(total),0)::numeric total,coalesce(sum(paid),0)::numeric paid,coalesce(sum(total-paid),0)::numeric outstanding FROM invoices WHERE hospital_id=$1 AND created_at>=current_date-interval '30 days'",[hid]),
      db.query("SELECT count(*)::int n FROM appointments WHERE hospital_id=$1 AND appointment_date>=current_date-interval '30 days' AND status='no_show'",[hid]),
      db.query("SELECT count(*)::int n FROM staff_profiles WHERE hospital_id=$1 AND active=true",[hid])
    ]);
    const data={today_appointments:ap.rows[0].n,today_visits:vis.rows[0].n,queue:queue.rows,followups_due:follow.rows[0].n,last_30_days_billing:bill.rows[0],last_30_days_no_shows:noShow.rows[0].n,active_staff:staff.rows[0].n};
    let text="";
    try{
      text=await litellmChat({system:"You are CareFlow's hospital operations analyst. Administrative only. Never diagnose, prescribe, interpret medical results, or recommend clinical treatment. Based only on the supplied aggregate operational metrics, produce a concise manager brief with exactly three sections: Situation, Attention, Actions. Use bullets. Do not invent facts or numbers. Actions must be operational (reception, queue, follow-up, billing, staffing).",user:JSON.stringify(data),maxTokens:450});
    }catch(aiError){
      text="Situation\\n• "+data.today_appointments+" appointments today and "+data.today_visits+" visits recorded.\\n\\nAttention\\n• "+data.followups_due+" follow-ups are due.\\n• "+data.last_30_days_no_shows+" no-shows were recorded in the last 30 days.\\n\\nActions\\n• Review the active queue and follow-ups.\\n• Review outstanding billing and recent no-shows.";
    }
    res.json({brief:text,data});
  }catch(e){res.status(500).json({error:e.message||"AI brief failed"});}
}
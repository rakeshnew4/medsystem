let adminInsightFilters={start:"",end:"",doctor_id:"",department_id:""};

function isoToday(){
  return new Date().toISOString().slice(0,10);
}
function isoDaysAgo(n){
  const d=new Date(Date.now()-n*86400000);
  return d.toISOString().slice(0,10);
}
function money(n){
  return "₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0});
}

async function loadAnalytics(){
  const box=document.getElementById("analyticsContent");
  if(!box)return;
  if(!can("page.admin_insights")){
    box.innerHTML="<div class='empty'>Admin insights are available only to hospital administrators.</div>";
    return;
  }
  if(!adminInsightFilters.start)adminInsightFilters.start=isoDaysAgo(29);
  if(!adminInsightFilters.end)adminInsightFilters.end=isoToday();
  box.innerHTML="<div class='empty'>Loading admin insights…</div>";
  try{
    const qs=new URLSearchParams({start:adminInsightFilters.start,end:adminInsightFilters.end});
    if(adminInsightFilters.doctor_id)qs.set("doctor_id",adminInsightFilters.doctor_id);
    if(adminInsightFilters.department_id)qs.set("department_id",adminInsightFilters.department_id);
    const d=await api("/admin-insights?"+qs.toString());
    renderAdminInsights(d);
  }catch(e){
    box.innerHTML="<div class='empty'>Could not load admin insights: "+esc(e.message)+"</div>";
  }
}

function renderAdminInsights(d){
  const box=document.getElementById("analyticsContent");
  const s=d.summary||{},q=d.queue||{},ps=d.patient_status||{};
  const docs=d.doctors||[],deps=d.departments||[];
  const total=Math.max(1,Number(s.appointments||0));
  const maxDay=Math.max(1,...(d.daily||[]).map(x=>Number(x.appointments||0)));
  const doctorOptions=docs.map(x=>"<option value='"+esc(x.id)+"' "+(String(adminInsightFilters.doctor_id)===String(x.id)?"selected":"")+">"+esc(x.name)+"</option>").join("");
  const deptOptions=deps.map(x=>"<option value='"+esc(x.id)+"' "+(String(adminInsightFilters.department_id)===String(x.id)?"selected":"")+">"+esc(x.name)+"</option>").join("");

  box.innerHTML=
    "<div class='card panel' style='margin-bottom:16px'>"+
      "<div class='form-grid'>"+
        "<div class='field'><label>From</label><input id='adminInsightStart' type='date' value='"+esc(adminInsightFilters.start)+"'></div>"+
        "<div class='field'><label>To</label><input id='adminInsightEnd' type='date' value='"+esc(adminInsightFilters.end)+"'></div>"+
        "<div class='field'><label>Department</label><select id='adminInsightDepartment'><option value=''>All departments</option>"+deptOptions+"</select></div>"+
        "<div class='field'><label>Doctor</label><select id='adminInsightDoctor'><option value=''>All doctors</option>"+doctorOptions+"</select></div>"+
        "<div style='display:flex;align-items:end;gap:8px'><button class='btn primary' onclick='applyAdminInsightFilters()'>Apply filters</button><button class='btn' onclick='resetAdminInsightFilters()'>Reset</button></div>"+
      "</div>"+
      "<div style='font-size:12px;color:var(--muted);margin-top:10px'>Showing "+esc(d.filters.start)+" to "+esc(d.filters.end)+(adminInsightFilters.doctor_id?" · doctor filtered":"")+(adminInsightFilters.department_id?" · department filtered":"")+"</div>"+
    "</div>"+

    "<div class='grid stats'>"+
      statCard("Appointments",s.appointments,"scheduled in selected period")+
      statCard("Completed",s.completed,(s.completion_rate||0)+"% completion")+
      statCard("No-shows",s.no_shows,(s.no_show_rate||0)+"% of appointments")+
      statCard("Cancelled",s.cancelled,(s.cancellation_rate||0)+"% of appointments")+
      statCard("Patients",s.patients,"unique patients in period")+
      statCard("New patients",s.new_patients,"registered in selected period")+
      statCard("Active patients",s.active_patients,"currently active")+
      statCard("Avg consultation",s.avg_minutes==null?"—":s.avg_minutes+" min","completed visits")+
    "</div>"+

    "<div class='grid two-col' style='margin-top:16px'>"+
      "<div class='card panel'><div class='panel-head'><div><h2 class='panel-title'>Current patient flow</h2><div style='font-size:12px;color:var(--muted)'>Today's live queue.</div></div></div>"+
        "<div class='grid stats' style='grid-template-columns:repeat(4,1fr)'>"+
          statCard("Active queue",q.active_queue||0,"today")+
          statCard("Waiting",q.waiting||0,"reception")+
          statCard("Vitals",q.vitals||0,"nurse")+
          statCard("Doctor room",q.doctor_room||0,"consultation")+
        "</div>"+
      "</div>"+
      "<div class='card panel'><div class='panel-head'><div><h2 class='panel-title'>Patient base</h2><div style='font-size:12px;color:var(--muted)'>Hospital-wide current status.</div></div></div>"+
        "<div class='grid stats' style='grid-template-columns:repeat(3,1fr)'>"+
          statCard("Total",ps.total||s.total_patients||0,"registered")+
          statCard("Active",ps.active||s.active_patients||0,"active records")+
          statCard("Inactive",ps.inactive||0,"inactive records")+
        "</div>"+
      "</div>"+
    "</div>"+

    "<div class='grid two-col' style='margin-top:16px'>"+
      "<div class='card panel'><div class='panel-head'><div><h2 class='panel-title'>Doctor performance overview</h2><div style='font-size:12px;color:var(--muted)'>Volume and completion for the selected filters.</div></div></div>"+
        "<div class='table-wrap'><table><thead><tr><th>Doctor</th><th>Dept.</th><th>Appointments</th><th>Done</th><th>No-show</th><th>Patients</th><th>Avg min</th></tr></thead><tbody>"+
        (docs.length?docs.map(x=>"<tr><td><strong>"+esc(x.name)+"</strong><div style='font-size:11px;color:var(--muted)'>"+esc(x.specialty||"")+"</div></td><td>"+esc(x.department||"—")+"</td><td>"+x.appointments+"</td><td>"+x.completed+"</td><td>"+x.no_shows+"</td><td>"+x.patients+"</td><td>"+(x.avg_minutes==null?"—":x.avg_minutes)+"</td></tr>").join(""):"<tr><td colspan='7'><div class='empty'>No doctor data for these filters.</div></td></tr>")+
        "</tbody></table></div>"+
      "</div>"+
      "<div class='card panel'><div class='panel-head'><div><h2 class='panel-title'>Appointment trend</h2><div style='font-size:12px;color:var(--muted)'>Daily appointments in the selected period.</div></div></div>"+
        "<div style='display:grid;gap:7px'>"+
        (d.daily||[]).slice(-14).map(x=>"<div style='display:grid;grid-template-columns:72px 1fr 44px;align-items:center;gap:8px;font-size:12px'><span>"+esc(x.day)+"</span><div style='height:10px;background:#edf1ef;border-radius:6px;overflow:hidden'><div style='height:100%;width:"+Math.round(Number(x.appointments||0)*100/maxDay)+"%;background:#173f35'></div></div><strong>"+x.appointments+"</strong></div>").join("")+
        "</div>"+
      "</div>"+
    "</div>"+

    "<div class='card panel' style='margin-top:16px'><div class='panel-head'><div><h2 class='panel-title'>Management summary</h2><div style='font-size:12px;color:var(--muted)'>Quick read of the selected period.</div></div></div>"+
      "<div class='grid two-col'>"+
        "<div><strong>"+s.completed+"</strong> completed of <strong>"+s.appointments+"</strong> appointments ("+(s.completion_rate||0)+"%). <strong>"+s.no_shows+"</strong> no-shows and <strong>"+s.cancelled+"</strong> cancellations.</div>"+
        "<div><strong>"+s.new_patients+"</strong> new patients were registered during the selected period; the hospital currently has <strong>"+s.active_patients+"</strong> active patient records.</div>"+
      "</div>"+
    "</div>";
}

function statCard(label,value,note){
  return "<div class='stat'><div class='stat-label'>"+esc(label)+"</div><div class='stat-value'>"+esc(value)+"</div><div class='stat-meta'>"+esc(note)+"</div></div>";
}

function applyAdminInsightFilters(){
  adminInsightFilters.start=document.getElementById("adminInsightStart")?.value||isoDaysAgo(29);
  adminInsightFilters.end=document.getElementById("adminInsightEnd")?.value||isoToday();
  adminInsightFilters.department_id=document.getElementById("adminInsightDepartment")?.value||"";
  adminInsightFilters.doctor_id=document.getElementById("adminInsightDoctor")?.value||"";
  loadAnalytics();
}

function resetAdminInsightFilters(){
  adminInsightFilters={start:isoDaysAgo(29),end:isoToday(),doctor_id:"",department_id:""};
  loadAnalytics();
}

window.loadAnalytics=loadAnalytics;
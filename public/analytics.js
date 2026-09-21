async function loadAnalytics(){
  const box=document.getElementById("analyticsContent");
  if(!box)return;
  box.innerHTML="<div class='empty'>Loading clinic insights…</div>";
  try{
    const d=await api("/analytics");
    const rev=d.revenue||{}, ns=d.no_show||{}, docs=d.doctor||[], daily=d.daily||[], pat=d.patients||{}, fu=d.followups||{};
    const totalAppts=daily.reduce((a,x)=>a+Number(x.appointments||0),0);
    const completed=daily.reduce((a,x)=>a+Number(x.completed||0),0);
    const noShows=daily.reduce((a,x)=>a+Number(x.no_shows||0),0);
    const completion=totalAppts?Math.round(completed*1000/totalAppts)/10:0;
    const peak=daily.reduce((best,x)=>Number(x.appointments)>Number(best?.appointments||-1)?x:best,null);
    const maxDay=Math.max(1,...daily.map(x=>Number(x.appointments||0)));
    const money=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0});

    box.innerHTML=
      "<div class='grid stats'>"+
        "<div class='stat'><div class='stat-label'>Appointments</div><div class='stat-value'>"+totalAppts+"</div><div class='stat-meta'>last 60 days</div></div>"+
        "<div class='stat'><div class='stat-label'>Completed visits</div><div class='stat-value'>"+completed+"</div><div class='stat-meta'>"+completion+"% completion</div></div>"+
        "<div class='stat'><div class='stat-label'>No-shows</div><div class='stat-value'>"+noShows+"</div><div class='stat-meta'>"+(ns.rate||0)+"% of appointments</div></div>"+
        "<div class='stat'><div class='stat-label'>Collected</div><div class='stat-value'>"+money(rev.collected)+"</div><div class='stat-meta'>of "+money(rev.billed)+" billed</div></div>"+
        "<div class='stat'><div class='stat-label'>Outstanding</div><div class='stat-value'>"+money(rev.outstanding)+"</div><div class='stat-meta'>payments due</div></div>"+
      "</div>"+

      "<div class='grid two-col' style='margin-top:16px'>"+
        "<div class='card panel'>"+
          "<div class='panel-head'><div><h2 class='panel-title'>Daily patient flow</h2><div style='font-size:12px;color:var(--muted)'>Appointments and completed visits across the last 60 days.</div></div></div>"+
          "<div style='display:grid;gap:8px'>"+
            daily.slice(-14).map(x=>"<div style='display:grid;grid-template-columns:72px 1fr 42px;align-items:center;gap:8px;font-size:12px'><span>"+x.day+"</span><div style='height:10px;background:#edf1ef;border-radius:6px;overflow:hidden'><div style='height:100%;width:"+Math.round(Number(x.appointments||0)*100/maxDay)+"%;background:#173f35'></div></div><strong>"+x.appointments+"</strong></div>").join("")+
          "</div>"+
          (peak?"<div style='margin-top:12px;font-size:12px;color:var(--muted)'>Busiest day: <strong style='color:var(--ink)'>"+peak.day+"</strong> with <strong style='color:var(--ink)'>"+peak.appointments+"</strong> appointments.</div>":"")+
        "</div>"+

        "<div class='card panel'>"+
          "<div class='panel-head'><div><h2 class='panel-title'>Doctor workload</h2><div style='font-size:12px;color:var(--muted)'>Consultation volume and average visit duration.</div></div></div>"+
          "<div class='table-wrap'><table><thead><tr><th>Doctor</th><th>Visits</th><th>Avg duration</th></tr></thead><tbody>"+
            docs.map(x=>"<tr><td><strong>"+esc(x.name)+"</strong></td><td>"+x.visits+"</td><td>"+(x.avg_minutes??"—")+" min</td></tr>").join("")+
          "</tbody></table></div>"+
        "</div>"+
      "</div>"+

      "<div class='grid two-col' style='margin-top:16px'>"+
        "<div class='card panel'><div class='panel-head'><div><h2 class='panel-title'>Revenue snapshot</h2><div style='font-size:12px;color:var(--muted)'>Billing recorded during the same 60-day period.</div></div></div><div style='display:grid;gap:12px'><div><span style='font-size:12px;color:var(--muted)'>Billed</span><div style='font-size:24px;font-weight:800'>"+money(rev.billed)+"</div></div><div><span style='font-size:12px;color:var(--muted)'>Collected</span><div style='font-size:24px;font-weight:800'>"+money(rev.collected)+"</div></div><div><span style='font-size:12px;color:var(--muted)'>Outstanding</span><div style='font-size:24px;font-weight:800'>"+money(rev.outstanding)+"</div></div></div></div>"+
        "<div class='card panel'><div class='panel-head'><div><h2 class='panel-title'>Operational signals</h2><div style='font-size:12px;color:var(--muted)'>Useful items for the clinic team.</div></div></div><div style='display:grid;gap:12px'><div><strong>"+(pat.new_30d||0)+"</strong><div style='font-size:12px;color:var(--muted)'>patients created in last 30 days</div></div><div><strong>"+(fu.due||0)+"</strong><div style='font-size:12px;color:var(--muted)'>follow-ups currently due</div></div><div><strong>"+(ns.rate||0)+"%</strong><div style='font-size:12px;color:var(--muted)'>appointment no-show rate</div></div></div></div>"+
      "</div>";
  }catch(e){
    box.innerHTML="<div class='empty'>Could not load insights: "+esc(e.message)+"</div>";
  }
}
window.loadAnalytics=loadAnalytics;
import { browser, storage, ai } from "hatchable";

export const access="admin";
export const methods=["GET","POST"];

const TARGETS=[
  {name:"patient-workspace",url:"https://hospital-ai.hatchable.site/"},
  {name:"staff-login",url:"https://hospital-ai.hatchable.site/login"},
  {name:"patient-portal",url:"https://hospital-ai.hatchable.site/patient/"},
  {name:"opd",url:"https://hospital-ai.hatchable.site/opd/"},
  {name:"opd-token",url:"https://hospital-ai.hatchable.site/opd/token/"},
  {name:"portal-home",url:"https://hospital-ai.hatchable.site/portal/"},
  {name:"display",url:"https://hospital-ai.hatchable.site/display/"},
  {name:"ai-flow-agent",url:"https://hospital-ai.hatchable.site/"}
];

const VISION_PROMPT=(meta)=>`You are a meticulous senior hospital-HMIS UI/UX visual QA reviewer.
Inspect ONLY what is visibly present in this screenshot. Do not infer backend behavior.
Look for: clipping/overflow, alignment, spacing, hierarchy, typography, contrast/readability,
touch target size, mobile responsiveness, duplicated/confusing controls, disabled/broken-looking
controls, missing feedback, awkward empty states, and whether the visible screen makes the next
intended action obvious.
Return ONLY valid JSON with:
{
  "visual_quality":"good"|"needs_attention",
  "severity":"none"|"low"|"medium"|"high",
  "layout_issues":[],
  "readability_issues":[],
  "mobile_issues":[],
  "interaction_risk":[],
  "recommended_fixes":[],
  "summary":"..."
}
Viewport: ${meta.width}x${meta.height}; page: ${meta.name}; scroll_state: ${meta.scroll_state}.`;

function b64(bytes){
  let s=""; const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)s+=String.fromCharCode(...bytes.slice(i,i+chunk));
  return btoa(s);
}

async function callVision(url,key,model,png,meta){
  const r=await fetch(url,{
    method:"POST",
    headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({
      model,
      temperature:0.05,
      max_tokens:700,
      messages:[{role:"user",content:[
        {type:"text",text:VISION_PROMPT(meta)},
        {type:"image_url",image_url:{url:"data:image/png;base64,"+b64(png)}}
      ]}]
    })
  });
  const body=await r.json();
  return {
    status:r.status,
    model,
    review:body?.choices?.[0]?.message?.content||body?.error?.message||null
  };
}

async function liteLLMReview(png,meta){
  let base=String(process.env.LITELLM_URL||"").trim().replace(/\/$/,"");
  const key=String(process.env.LITELLM_API_KEY||"").trim();
  if(!base||!key)return {status:"not_configured",provider:"litellm"};
  // Hatchable secrets may contain host:port without a scheme.
  if(!/^https?:\/\//i.test(base))base="http://"+base;
  // Deliberately pin the visual fallback to Gemini 2.5 Flash Lite.
  // Do not let an unrelated LITELLM_MODEL secret silently change visual QA.
  const model="gemini-2.5-flash-lite";
  const endpoint=base.endsWith("/v1")?base+"/chat/completions":base+"/v1/chat/completions";
  try{
    return {provider:"litellm",...(await callVision(endpoint,key,model,png,meta))};
  }catch(error){
    return {provider:"litellm",status:"error",model,error:String(error?.message||error)};
  }
}

async function reviewWithFallback(png,meta){
  const groq=String(process.env.GROQ_API_KEY||"").trim();
  if(groq){
    try{
      const r=await callVision("https://api.groq.com/openai/v1/chat/completions",groq,"qwen/qwen3.8-27b",png,meta);
      if(r.status===200&&r.review)return {provider:"groq",...r};
    }catch{}
  }
  const llm=await liteLLMReview(png,meta);
  if(llm.status===200&&llm.review)return llm;
  return {provider:"none",status:"unavailable",groq_attempted:!!groq,litellm_status:llm.status||null};
}

async function safeUiActions(page,target){
  const actions=[];
  const before=await page.evaluate(()=>({
    buttons:Array.from(document.querySelectorAll("button")).filter(b=>b.offsetParent!==null).map((b,i)=>({i,text:(b.innerText||"").trim().slice(0,100),disabled:b.disabled})).slice(0,50),
    links:Array.from(document.querySelectorAll("a")).filter(a=>a.offsetParent!==null).map((a,i)=>({i,text:(a.innerText||"").trim().slice(0,100),href:a.getAttribute("href")})).slice(0,50)
  }));
  // Only click controls that are visibly navigation/view-state controls.
  const safeTexts=/^(home|back|close|cancel|book appointment|manage appointment|track token|phone otp|email otp|show|view|details|history|next|previous|menu|open)$/i;
  for(const b of before.buttons){
    if(b.disabled||!safeTexts.test(b.text))continue;
    try{
      const result=await page.evaluate(i=>{
        const bs=Array.from(document.querySelectorAll("button")).filter(x=>x.offsetParent!==null);
        const b=bs[i]; if(!b)return {ok:false};
        b.click();
        return {ok:true,text:(b.innerText||"").trim()};
      },b.i);
      actions.push({type:"button",...result});
    }catch(error){actions.push({type:"button",text:b.text,ok:false,error:String(error?.message||error)})}
  }
  if(target.name==="patient-portal"){
    for(const id of ["homeTab","bookTab","manageTab","tokenTab"]){
      const result=await page.evaluate(id=>{
        const b=document.getElementById(id); if(!b)return {id,ok:false,reason:"missing"};
        b.click(); const section=id.replace("Tab",""); const el=document.getElementById(section);
        return {id,ok:!!el&&!el.classList.contains("hidden"),section};
      },id);
      actions.push({type:"patient-tab",...result});
    }
  }
  if(target.name==="patient-workspace"){
    actions.push(await page.evaluate(async()=>{
      if(typeof window.showSection==="function"){window.showSection("patients");await new Promise(r=>setTimeout(r,500));}
      else {
        const launcher=Array.from(document.querySelectorAll("button")).find(b=>(b.innerText||"").includes("Patient Lookup") && (b.innerText||"").includes("Search registered patients"));
        if(launcher){launcher.click();await new Promise(r=>setTimeout(r,500));}
      }
      const section=document.getElementById("patients");
      if(!section)return {type:"patient-workspace",ok:false,reason:"patient workspace section missing"};
      section.scrollIntoView({block:"start"});
      await new Promise(r=>setTimeout(r,150));
      const buttons=Array.from(section.querySelectorAll("button")).filter(b=>b.offsetParent!==null);
      const labels=buttons.map(b=>(b.innerText||"").trim().replace(/\s+/g," ").slice(0,100));
      const before={buttons:labels.length,labels,scrollTop:Math.round(section.scrollTop||0)};
      const body=section.querySelector(".patient-workspace-main");
      if(body){
        body.scrollTop=body.scrollHeight;
        await new Promise(r=>setTimeout(r,80));
      }
      const after={bodyScrollable:!!body&&body.scrollHeight>body.clientHeight+8,bodyScrollTop:Math.round(body?.scrollTop||0)};
      const modalBefore=!!document.getElementById("patientWorkspaceActionModal");
      return {type:"patient-workspace-surface",ok:true,before,after,modalBefore};
    }));
  }
  if(target.name==="staff-login"){
    actions.push(await page.evaluate(()=>{
      const email=document.getElementById("email"),submit=document.getElementById("submit");
      if(!email||!submit)return {type:"login-validation",ok:false};
      email.value=""; submit.click();
      return {type:"login-validation",ok:document.getElementById("msg")?.textContent==="Enter your hospital email.",message:document.getElementById("msg")?.textContent||""};
    }));
  }
  return actions;
}

async function captureState(page,target,width,height,scrollState){
  const state=await page.evaluate(()=>({
    url:location.href,title:document.title,
    scrollY:Math.round(window.scrollY),viewportHeight:window.innerHeight,
    documentHeight:document.documentElement.scrollHeight,
    horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
    visibleText:(document.body.innerText||"").slice(0,1800),
    consoleErrors:window.__careflowErrors||[],
    scrollContainers:Array.from(document.querySelectorAll("*")).filter(el=>{
      const s=getComputedStyle(el);
      return el.scrollHeight>el.clientHeight+8 && ["auto","scroll"].includes(s.overflowY);
    }).slice(0,80).map(el=>({
      tag:el.tagName,id:el.id||null,cls:String(el.className||"").slice(0,100),
      clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,
      scrollTop:Math.round(el.scrollTop)
    })),
    visibleButtons:Array.from(document.querySelectorAll("button")).filter(b=>b.offsetParent!==null).map((b,i)=>({
      index:i,text:(b.innerText||"").trim().replace(/\s+/g," ").slice(0,120),
      disabled:b.disabled,rect:(()=>{const r=b.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})()
    })).slice(0,100)
  }));
  const png=await page.screenshot({fullPage:false});
  const key="e2e/visual/"+new Date().toISOString().slice(0,10)+"/"+target.name+"-"+width+"x"+height+"-"+scrollState+".png";
  await storage.put(key,png,"image/png");
  const review=await reviewWithFallback(png,{name:target.name,width,height,scroll_state:scrollState});
  return {state,storage_key:key,review};
}

async function runFlowAgent(page,width,height){
  const log=[];
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const audit=async stage=>page.evaluate(stage=>({
    stage,activeSection:document.querySelector(".section.active")?.id||null,
    modals:Array.from(document.querySelectorAll(".modal.open,#patientWorkspaceActionModal,#patientModal,#clinicalModal")).map(x=>x.id),
    buttons:Array.from(document.querySelectorAll("button")).filter(b=>b.offsetParent!==null).map(b=>(b.innerText||"").trim().replace(/\\s+/g," ")).filter(Boolean).slice(0,100),
    text:(document.body.innerText||"").slice(0,2400)
  }),stage);
  const aiChoose=async(stage,allowed)=>{
    try{
      const context=await audit(stage);
      const key=String(process.env.GROQ_API_KEY||"").trim();
      if(!key)return {plan:{action:allowed[0],reason:"No Groq controller key; deterministic allowed action fallback"},context};
      const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({
        model:"qwen/qwen3.8-27b",temperature:0,max_tokens:180,
        messages:[
          {role:"system",content:"You are a deterministic hospital HMIS UI test controller. Choose exactly one allowed action. Never invent actions, never use real patient data, never make clinical decisions. Return JSON only."},
          {role:"user",content:JSON.stringify({stage,allowed,context})}
        ]
      })});
      const body=await r.json();
      const raw=String(body?.choices?.[0]?.message?.content||"").trim().replace(/^\\s*\\{/, "{").replace(/\\}\\s*$/, "}");
      return {plan:JSON.parse(raw),context};
    }catch(e){return {plan:{action:allowed[0],reason:"AI fallback: "+String(e?.message||e)},context:null};}
  };
  const add=async(stage,ok,details)=>log.push({stage,ok,...(details||{})});
  const set=async(sel,value)=>page.evaluate(({sel,value})=>{
    const e=document.querySelector(sel);if(!e)return false;
    const proto=e.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
    if(setter)setter.call(e,String(value));else e.value=String(value);
    e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));return true;
  },{sel,value});
  const submit=sel=>page.evaluate(sel=>{const f=document.querySelector(sel);if(!f)return false;f.requestSubmit();return true},sel);
  const visible=sel=>page.evaluate(sel=>{const e=document.querySelector(sel);if(!e)return false;const r=e.getBoundingClientRect();return e.offsetParent!==null&&r.width>0&&r.height>0},sel);
  const closeAll=()=>page.evaluate(()=>{window.closePatientWorkspaceActionModal?.();["appointmentModal","patientModal","clinicalModal","vitalsModal"].forEach(id=>window.closeModal?.(id));document.getElementById("cfPaymentQrModal")?.remove()});
  const authProbe=await page.evaluate(async()=>{
    const out={};
    for(const path of ["/api/patient-workspace?patient_id=126","/api/appointments"]){
      try{const r=await fetch(path,{credentials:"include"});out[path]=r.status}catch(e){out[path]="error"}
    }
    return out;
  });
  if(Object.values(authProbe).some(v=>v===401||v===403)){
    return {ok:false,blocked:"genuine signed-in hospital staff session required",authProbe,log:[{stage:"auth-gate",ok:false,reason:"Browser harness is not a genuine staff end-user session; mutating workflow execution is intentionally not faked."}]};
  }

  let x=await aiChoose("appointment",["open_appointments","create_appointment"]);
  await add("ai-appointment-plan",["open_appointments","create_appointment"].includes(x.plan.action),{plan:x.plan});
  await page.evaluate(()=>{
    const b=Array.from(document.querySelectorAll("button")).find(x=>(x.getAttribute("onclick")||"").includes("showSection('appointments')"));
    if(b)b.click(); else window.showSection?.("appointments");
  }); await wait(900);
  await page.evaluate(()=>window.openModal?.("appointmentModal")); await wait(900);
  const fixture=await page.evaluate(()=>{
    const patient={id:126,name:"E2E Test Patient",phone:"+919999000001"};
    const option=document.querySelector("#apptDoctorOptions option");
    const doctor=option?{id:Number(option.value||option.getAttribute("data-id")||1),name:option.value||option.textContent||"Doctor"}:{id:1,name:"suntia"};
    return {patient,doctor};
  });
  await add("fixtures",!!fixture.patient&&!!fixture.doctor,fixture);
  if(!fixture.patient||!fixture.doctor)return {ok:false,log};
  await set("#apptPatientName",fixture.patient.name);
  await page.evaluate(()=>window.selectAppointmentPatient?.(document.getElementById("apptPatientName")?.value));
  await set("#apptDoctorSearch",fixture.doctor.name);
  await set("#apptDoctor",fixture.doctor.id);
  await set("#apptDate",await page.evaluate(()=>new Date().toISOString().slice(0,10)));
  await set("#apptTime",await page.evaluate(()=>{const d=new Date(Date.now()+3600000);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")}));
  await set("#apptReason","AI E2E workflow verification");
  await set("#apptConsultationType","in_person");
  await submit("#appointmentForm"); await wait(1400);
  const apt=await page.evaluate(()=>({
    modal:!!document.querySelector("#appointmentModal.open"),
    qr:!!document.getElementById("cfPaymentQrModal"),
    row:(window.state?.appointments||[]).find(x=>Number(x.patient_id)===126&&String(x.reason||"").includes("AI E2E workflow verification"))||null
  }));
  await add("create-appointment",!!apt.row,{result:apt}); await closeAll();

  x=await aiChoose("patient-workspace",["open_patient_workspace","select_test_patient"]);
  await add("ai-workspace-plan",["open_patient_workspace","select_test_patient"].includes(x.plan.action),{plan:x.plan});
  await page.evaluate(()=>{
    const b=Array.from(document.querySelectorAll("button")).find(x=>(x.getAttribute("onclick")||"").includes("showSection('patients')"));
    if(b)b.click(); else window.showSection?.("patients");
  }); await wait(900);
  await page.evaluate(()=>{
    const b=Array.from(document.querySelectorAll("#patientDirectory button")).find(x=>(x.innerText||"").includes("E2E Test Patient"));
    if(b)b.click();
  }); await wait(1600);
  const ws=await audit("workspace-selected");
  await add("patient-workspace",ws.activeSection==="patients"&&ws.text.includes("E2E Test Patient"),{snapshot:ws});

  x=await aiChoose("vitals",["open_vitals","save_vitals"]);
  await add("ai-vitals-plan",["open_vitals","save_vitals"].includes(x.plan.action),{plan:x.plan});
  const clicked=await page.evaluate(()=>{
    const b=Array.from(document.querySelectorAll("#patientWorkspaceBody button,.patient-quick-actions button")).find(x=>(x.innerText||"").trim()==="Vitals");
    if(!b)return false;b.click();return true;
  });
  await wait(400);
  const vOpen=await visible("#patientWorkspaceActionModal");
  await add("vitals-modal",clicked&&vOpen,{snapshot:await audit("vitals-modal")});
  if(vOpen){
    const vals={blood_pressure_systolic:"120",blood_pressure_diastolic:"80",pulse:"72",temperature:"36.7",weight_kg:"70",height_cm:"170",spo2:"98",respiratory_rate:"16",notes:"AI E2E TEST DATA — safe to reset"};
    for(const [k,v] of Object.entries(vals))await set("#patientWorkspaceActionModal [name='"+k+"']",v);
    await submit("#patientWorkspaceActionModal form"); await wait(1400);
    const saved=await page.evaluate(()=>({modal:!!document.getElementById("patientWorkspaceActionModal"),text:(document.getElementById("patientWorkspaceBody")?.innerText||"").slice(0,2600)}));
    await add("save-vitals",!saved.modal&&saved.text.includes("120")&&saved.text.includes("80"),{result:saved});
  }

  x=await aiChoose("next-action",["trigger_next_action","verify_workspace_buttons"]);
  await add("ai-next-action-plan",["trigger_next_action","verify_workspace_buttons"].includes(x.plan.action),{plan:x.plan});
  const next=await page.evaluate(()=>{
    const buttons=Array.from(document.querySelectorAll("#patientWorkspaceBody button,.patient-workspace-main button")).filter(b=>b.offsetParent!==null);
    const b=buttons.find(x=>/^(Do now|Next action)$/i.test((x.innerText||"").trim()));
    if(!b)return {found:false};b.click();return {found:true,text:(b.innerText||"").trim()};
  });
  await wait(500);
  await add("next-action-trigger",next.found,{result:next,after:await audit("after-next-action")});
  await closeAll();

  const buttons=await page.evaluate(()=>Array.from(document.querySelectorAll("#patients button,#patientWorkspaceBody button")).filter(b=>b.offsetParent!==null).map((b,i)=>({i,text:(b.innerText||"").trim().replace(/\\s+/g," "),disabled:b.disabled})).filter(x=>x.text));
  const scroll=await page.evaluate(()=>({window:{y:Math.round(scrollY),height:innerHeight,doc:document.documentElement.scrollHeight},workspace:(()=>{const e=document.querySelector(".patient-workspace-main");return e?{client:e.clientHeight,scroll:e.scrollHeight,top:e.scrollTop}:null})(),horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}));
  await add("workspace-button-audit",buttons.length>0,{count:buttons.length,buttons});
  await add("workspace-scroll-audit",!scroll.horizontalOverflow,{result:scroll});
  return {ok:log.every(x=>x.ok),log,final:await audit("final-workspace")};
}

async function runTarget(target,width,height,demoRole=null){
  return browser.session(async page=>{
    await page.setViewport({width,height});
    if(demoRole){
      await page.setCookie({name:"careflow_demo_role",value:String(demoRole).toLowerCase(),domain:"hospital-ai.hatchable.site",path:"/",secure:true,httpOnly:false});
    }
    await page.goto(target.url,{waitUntil:"domcontentloaded"});
    await new Promise(r=>setTimeout(r,800));
    if(target.name==="ai-flow-agent")return {flow_agent:await runFlowAgent(page,width,height)};

    const top=await captureState(page,target,width,height,"top");
    const interactions=await safeUiActions(page,target);

    await page.evaluate(()=>window.scrollTo({top:Math.max(0,Math.floor(document.documentElement.scrollHeight*0.45)),behavior:"instant"}));
    await new Promise(r=>setTimeout(r,250));
    const middle=await captureState(page,target,width,height,"middle");

    await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"}));
    await new Promise(r=>setTimeout(r,250));
    const bottom=await captureState(page,target,width,height,"bottom");

    const final=await page.evaluate(()=>({
      scrollY:Math.round(window.scrollY),
      horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2
    }));
    return {top,interactions,middle,bottom,final};
  });
}

export default async function(req,res){
  const started=Date.now();
  const width=Number(req.body?.width||req.query?.width||1440);
  const height=Number(req.body?.height||req.query?.height||900);
  const mobile=req.body?.mobile===true||req.query?.mobile==="true";
  const selected=String(req.body?.targets||req.query?.targets||"").split(",").map(x=>x.trim()).filter(Boolean);
  const requestedDemoRole=String(req.body?.demo_role||req.query?.demo_role||"").trim().toLowerCase();
  const demoRole=["admin","receptionist","nurse","doctor","lab","pharmacy","billing","store"].includes(requestedDemoRole)?requestedDemoRole:null;
  const targets=selected.length?TARGETS.filter(x=>selected.includes(x.name)):TARGETS;
  const sizes=mobile?[[390,844]]:[[width,height],[390,844]];
  const results=[];
  for(const target of targets){
    for(const [w,h] of sizes){
      try{results.push({target:target.name,width:w,height:h,demo_role:demoRole,...await runTarget(target,w,h,demoRole)})}
      catch(error){results.push({target:target.name,width:w,height:h,error:String(error?.message||error)})}
    }
  }
  res.json({ok:true,version:"e2e-visual-v2",duration_ms:Date.now()-started,targets:results.length,results});
}
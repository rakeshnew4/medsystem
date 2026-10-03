import { browser, storage } from "hatchable";

export const access="admin";
export const methods=["GET","POST"];

const TARGETS=[
  {name:"staff-login",url:"https://hospital-ai.hatchable.site/login"},
  {name:"patient-portal",url:"https://hospital-ai.hatchable.site/patient/"},
  {name:"opd",url:"https://hospital-ai.hatchable.site/opd/"},
  {name:"opd-token",url:"https://hospital-ai.hatchable.site/opd/token/"},
  {name:"portal-home",url:"https://hospital-ai.hatchable.site/portal/"},
  {name:"display",url:"https://hospital-ai.hatchable.site/display/"}
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
  const base=String(process.env.LITELLM_URL||"").trim().replace(/\/$/,"");
  const key=String(process.env.LITELLM_API_KEY||"").trim();
  if(!base||!key)return {status:"not_configured",provider:"litellm"};
  // Keep the visual fallback deterministic: LiteLLM routes this model name
  // to the configured Gemini 2.5 Flash Lite backend. No /models discovery call is needed.
  const model=String(process.env.LITELLM_MODEL||"gemini-2.5-flash-lite").trim();
  if(!model)return {status:"no_model",provider:"litellm"};
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
    consoleErrors:window.__careflowErrors||[]
  }));
  const png=await page.screenshot({fullPage:false});
  const key="e2e/visual/"+new Date().toISOString().slice(0,10)+"/"+target.name+"-"+width+"x"+height+"-"+scrollState+".png";
  await storage.put(key,png,"image/png");
  const review=await reviewWithFallback(png,{name:target.name,width,height,scroll_state:scrollState});
  return {state,storage_key:key,review};
}

async function runTarget(target,width,height){
  return browser.session(async page=>{
    await page.setViewport({width,height});
    await page.goto(target.url,{waitUntil:"domcontentloaded"});
    await new Promise(r=>setTimeout(r,500));

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
  const targets=selected.length?TARGETS.filter(x=>selected.includes(x.name)):TARGETS;
  const sizes=mobile?[[390,844]]:[[width,height],[390,844]];
  const results=[];
  for(const target of targets){
    for(const [w,h] of sizes){
      try{results.push({target:target.name,width:w,height:h,...await runTarget(target,w,h)})}
      catch(error){results.push({target:target.name,width:w,height:h,error:String(error?.message||error)})}
    }
  }
  res.json({ok:true,version:"e2e-visual-v2",duration_ms:Date.now()-started,targets:results.length,results});
}
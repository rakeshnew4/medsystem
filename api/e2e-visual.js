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

function b64(bytes){
  let s="";
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)s+=String.fromCharCode(...bytes.slice(i,i+chunk));
  return btoa(s);
}

async function groqReview(png,meta){
  const key=String(process.env.GROQ_API_KEY||"").trim();
  if(!key)return {status:"not_configured"};
  const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{
    method:"POST",
    headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"qwen/qwen3.8-27b",
      temperature:0.1,
      max_tokens:600,
      messages:[{role:"user",content:[
        {type:"text",text:"You are reviewing a hospital HMIS UI screenshot. Return concise JSON with exactly these keys: visual_quality, layout_issues, readability_issues, mobile_issues, interaction_risk, summary. visual_quality must be good or needs_attention. Only report visible UI facts and likely usability risks; do not infer hidden backend behavior. Viewport: "+meta.width+"x"+meta.height+"; screen: "+meta.name+"."},
        {type:"image_url",image_url:{url:"data:image/png;base64,"+b64(png)}}
      ]}]
    })
  });
  const body=await r.json();
  return {status:r.status,model:"qwen/qwen3.8-27b",review:body?.choices?.[0]?.message?.content||body?.error?.message||null};
}

async function runTarget(target,width,height){
  return browser.session(async page=>{
    const consoleErrors=[];
    await page.setViewport({width,height});
    await page.goto(target.url,{waitUntil:"domcontentloaded"});
    await new Promise(r=>setTimeout(r,500));
    const before=await page.evaluate(()=>({
      url:location.href,
      title:document.title,
      horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
      visibleText:(document.body.innerText||"").slice(0,1200)
    }));

    const interactions=[];
    if(target.name==="patient-portal"){
      for(const id of ["homeTab","bookTab","manageTab","tokenTab"]){
        const result=await page.evaluate(id=>{
          const b=document.getElementById(id);
          if(!b)return {id,ok:false,reason:"missing"};
          b.click();
          const section=id.replace("Tab","");
          const el=document.getElementById(section);
          return {id,ok:!!el&&!el.classList.contains("hidden"),section};
        },id);
        interactions.push(result);
      }
      const post=await page.evaluate(()=>({
        horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
        activeTabs:Array.from(document.querySelectorAll(".tabs .tab.active")).map(x=>x.id)
      }));
      interactions.push({responsive:post});
    }
    if(target.name==="staff-login"){
      const result=await page.evaluate(()=>{
        const form=document.getElementById("form"),email=document.getElementById("email"),submit=document.getElementById("submit");
        if(!form||!email||!submit)return {ok:false,reason:"login form missing"};
        email.value="";
        submit.click();
        return {ok:true,message:document.getElementById("msg")?.textContent||"",emailPresent:true};
      });
      interactions.push(result);
    }

    const png=await page.screenshot({fullPage:false});
    const key="e2e/visual/"+new Date().toISOString().slice(0,10)+"/"+target.name+"-"+width+"x"+height+".png";
    await storage.put(key,png,"image/png");
    const review=await groqReview(png,{name:target.name,width,height});
    return {before,interactions,storage_key:key,review};
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
      try{
        results.push({target:target.name,width:w,height:h,...await runTarget(target,w,h)});
      }catch(error){
        results.push({target:target.name,width:w,height:h,error:String(error?.message||error)});
      }
    }
  }
  res.json({ok:true,version:"e2e-visual-v1",duration_ms:Date.now()-started,targets:results.length,results});
}
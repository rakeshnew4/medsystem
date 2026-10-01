import { browser } from "hatchable";

export async function reviewScreenshot({url,prompt}) {
  const key=process.env.GROQ_API_KEY;
  if(!key) throw new Error("GROQ_API_KEY is not configured");
  const shot=await browser.screenshot(url,{width:1440,height:1000,fullPage:false});
  const image=Buffer.from(shot).toString("base64");
  const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
    body:JSON.stringify({
      model:"qwen/qwen3.8-27b",
      temperature:0,
      max_completion_tokens:900,
      response_format:{type:"json_object"},
      messages:[
        {role:"system",content:"You are a strict UI quality reviewer for a hospital operations application. Review only visible UI quality and workflow affordances. Do not make clinical judgments. Return JSON with keys: pass, score, issues, strengths, recommended_fixes. score is 0-100. issues and recommended_fixes are arrays of concise strings."},
        {role:"user",content:[
          {type:"text",text:prompt||"Review this CareFlow hospital application screen for clarity, missing controls, broken/overlapping UI, confusing workflow state, and whether the visible interface communicates the current task clearly."},
          {type:"image_url",image_url:{url:"data:image/png;base64,"+image}}
        ]}
      ]
    })
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error?.message||("Groq API "+r.status));
  let review;
  try{review=JSON.parse(data?.choices?.[0]?.message?.content||"{}")}catch{review={pass:false,score:0,issues:["Groq returned non-JSON review"],strengths:[],recommended_fixes:[]}};
  return {review,model:"qwen/qwen3.8-27b"};
}
export async function litellmChat({system,user,maxTokens=500,temperature=0.2,model}){
  const key=process.env.LITELLM_API_KEY;
  let base=String(process.env.LITELLM_URL||"http://108.181.187.227:8005/").trim().replace(/\/+$/,"");
  if(base&&!/^https?:\/\//i.test(base))base="http://"+base;
  const selectedModel=String(model||process.env.LITELLM_MODEL||"").trim();
  if(!key) throw new Error("LITELLM_API_KEY is not configured. Add it in the project secrets.");
  if(!selectedModel) throw new Error("LITELLM_MODEL is not configured. Add it in the project secrets.");
  const r=await fetch(base+"/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
    body:JSON.stringify({
      model:selectedModel,
      temperature,
      max_completion_tokens:maxTokens,
      messages:[{role:"system",content:system},{role:"user",content:user}]
    })
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`LiteLLM API ${r.status}: ${data?.error?.message||"LiteLLM request failed"}`);
  return data?.choices?.[0]?.message?.content?.trim()||"";
}
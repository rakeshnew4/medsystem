export async function groqChat({system,user,maxTokens=500,temperature=0.2}){
  const key=process.env.GROQ_API_KEY;
  if(!key) throw new Error("GROQ_API_KEY is not configured. Add it in the project secrets.");
  const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{
    method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
    body:JSON.stringify({model:"openai/gpt-oss-20b",temperature,max_completion_tokens:maxTokens,messages:[{role:"system",content:system},{role:"user",content:user}]})
  });
  const data=await r.json();
  if(!r.ok) throw new Error(`Groq API ${r.status}: ${data?.error?.message||"Groq request failed"}`);
  return data?.choices?.[0]?.message?.content?.trim()||"";
}
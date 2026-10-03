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

export async function litellmToolLoop({system,messages,tools,execute,maxTokens=700,temperature=0.1,model,maxIterations=5}){
  const key=process.env.LITELLM_API_KEY;
  let base=String(process.env.LITELLM_URL||"http://108.181.187.227:8005/").trim().replace(/\/+$/,"");
  if(base&&!/^https?:\/\//i.test(base))base="http://"+base;
  const selectedModel=String(model||process.env.LITELLM_MODEL||"").trim();
  if(!key) throw new Error("LITELLM_API_KEY is not configured. Add it in the project secrets.");
  if(!selectedModel) throw new Error("LITELLM_MODEL is not configured. Add it in the project secrets.");
  const history=[...(messages||[])];
  const openaiTools=(tools||[]).map(t=>({type:"function",function:{name:t.name,description:t.description,parameters:t.input}}));
  for(let iteration=0;iteration<maxIterations;iteration++){
    const r=await fetch(base+"/v1/chat/completions",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
      body:JSON.stringify({model:selectedModel,temperature,max_completion_tokens:maxTokens,messages:[{role:"system",content:system},...history],tools:openaiTools,tool_choice:"auto"})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(`LiteLLM API ${r.status}: ${data?.error?.message||"LiteLLM tool request failed"}`);
    const msg=data?.choices?.[0]?.message||{};
    history.push(msg);
    const calls=Array.isArray(msg.tool_calls)?msg.tool_calls:[];
    if(!calls.length)return {answer:String(msg.content||"").trim(),iterations:iteration+1};
    for(const call of calls){
      const name=String(call?.function?.name||"");
      let input={};
      try{input=JSON.parse(call?.function?.arguments||"{}")}catch{input={}};
      let result;
      try{result=await execute(name,input)}catch(e){result={error:String(e?.message||e)}}
      history.push({role:"tool",tool_call_id:String(call?.id||""),content:JSON.stringify(result)});
    }
  }
  return {answer:"I reached the safe tool-use limit. Please narrow the request and try again.",iterations:maxIterations};
}
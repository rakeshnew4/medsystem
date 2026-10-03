import { requirePermission } from "../lib/authz.js";
import { TOOLS, runTool } from "../lib/ai-agent-tools.js";
export const access="user";
export const methods=["GET","POST"];
export default async function(req,res){
  const requested=String(req.query?.tool||req.body?.tool||"").trim();
  if(req.method==="GET")return res.json({version:"1",tools:TOOLS});
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const definition=TOOLS.find(t=>t.name===requested);
  if(!definition)return res.status(404).json({error:"Unknown AI tool",available_tools:TOOLS.map(t=>t.name)});
  const ctx=await requirePermission(req,res,definition.permission);
  if(!ctx)return;
  try{
    const input=req.body?.input&&typeof req.body.input==="object"?req.body.input:{};
    const result=await runTool(definition.name,input,ctx.hospitalId);
    return res.json({tool:definition.name,read_only:true,result});
  }catch(e){return res.status(400).json({tool:definition.name,error:String(e?.message||e)});}
}
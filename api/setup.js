import { db } from "hatchable";
export const access = "admin";
export const methods = ["GET","POST"];
export default async function(req,res){
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.name) return res.status(400).json({error:"Hospital name is required"});
    const existing=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
    if(existing.rows[0]){
      const r=await db.query("UPDATE hospitals SET name=$1,phone=$2,address=$3,updated_at=now() WHERE id=$4 RETURNING id,name,phone,address",[b.name,b.phone||null,b.address||null,existing.rows[0].id]);
      return res.json(r.rows[0]);
    }
    const r=await db.query("INSERT INTO hospitals(name,phone,address) VALUES($1,$2,$3) RETURNING id,name,phone,address",[b.name,b.phone||null,b.address||null]);
    return res.json(r.rows[0]);
  }
  const r=await db.query("SELECT id,name,phone,address,timezone FROM hospitals ORDER BY id LIMIT 1");
  res.json(r.rows[0]||null);
}
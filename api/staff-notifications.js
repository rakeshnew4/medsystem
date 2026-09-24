import { db } from "hatchable";
import { requireStaff } from "../lib/authz.js";

export const access="user";
export const methods=["GET","PUT"];

export default async function(req,res){
  const ctx=await requireStaff(req,res);
  if(!ctx)return;
  const hid=ctx.hospitalId,sid=ctx.staff.id;
  if(!sid)return res.json({notifications:[],unread:0});
  if(req.method==="PUT"){
    const id=Number(req.body?.id);
    if(id)await db.query("UPDATE staff_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND hospital_id=$2 AND staff_id=$3",[id,hid,sid]);
    else await db.query("UPDATE staff_notifications SET read_at=COALESCE(read_at,now()) WHERE hospital_id=$1 AND staff_id=$2",[hid,sid]);
    return res.json({ok:true});
  }
  const r=await db.query("SELECT id,kind,title,body,entity_type,entity_id,read_at,created_at FROM staff_notifications WHERE hospital_id=$1 AND staff_id=$2 ORDER BY created_at DESC,id DESC LIMIT 50",[hid,sid]);
  const unread=r.rows.filter(x=>!x.read_at).length;
  res.json({notifications:r.rows,unread});
}
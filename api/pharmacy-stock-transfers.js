import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET","POST"];

function actor(ctx){ return String(ctx.user?.email || ctx.staff?.email || "unknown"); }
function isAdmin(ctx){ return ctx.staff?.role==="admin"; }

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.pharmacy.manage");
  if(!ctx)return;

  if(req.method==="GET"){
    const status=String(req.query?.status||"").trim();
    const destination=String(req.query?.destination_department_id||"").trim();
    const r=await db.query(`SELECT t.*,sd.name AS source_department_name,dd.name AS destination_department_name
       FROM pharmacy_stock_transfers t
       LEFT JOIN departments sd ON sd.id=t.source_department_id AND sd.hospital_id=t.hospital_id
       JOIN departments dd ON dd.id=t.destination_department_id AND dd.hospital_id=t.hospital_id
       WHERE t.hospital_id=$1 AND ($2='' OR t.status=$2)
         AND ($3='' OR t.destination_department_id=$3::bigint)
       ORDER BY t.requested_at DESC,t.id DESC LIMIT 500`,[ctx.hospitalId,status,destination]);
    return res.json({transfers:r.rows});
  }

  const b=req.body||{};
  const action=String(b.action||"").trim().toLowerCase();
  const id=Number(b.transfer_id);
  if(!["issue","receive","cancel"].includes(action)) return res.status(400).json({error:"action must be issue, receive or cancel"});
  if(action!=="issue" && (!Number.isInteger(id)||id<=0)) return res.status(400).json({error:"transfer_id is required for receive or cancel"});

  if(action==="issue"){
    const sourceId=Number(b.source_stock_id), destinationId=Number(b.destination_department_id), qty=Number(b.quantity);
    if(!Number.isInteger(sourceId)||sourceId<=0||!Number.isInteger(destinationId)||destinationId<=0||!Number.isFinite(qty)||qty<=0)
      return res.status(400).json({error:"source_stock_id, destination_department_id and positive quantity are required"});
    const source=await db.query(`SELECT id,hospital_id,department_id,medicine_name,batch_no,expiry_date,quantity,unit,active
      FROM pharmacy_stock WHERE id=$1 AND hospital_id=$2`,[sourceId,ctx.hospitalId]);
    const s=source.rows[0];
    if(!s)return res.status(404).json({error:"Source stock not found"});
    if(!s.active)return res.status(409).json({error:"Inactive stock cannot be transferred"});
    if(!isAdmin(ctx)&&Number(s.department_id)!==Number(ctx.staff.department_id))return res.status(403).json({error:"Source stock belongs to another department"});
    if(Number(s.department_id)===destinationId)return res.status(409).json({error:"Source and destination departments must differ"});
    const dept=await db.query("SELECT id FROM departments WHERE id=$1 AND hospital_id=$2",[destinationId,ctx.hospitalId]);
    if(!dept.rows[0])return res.status(404).json({error:"Destination department not found"});
    const r=await db.query(`WITH locked AS (
        SELECT id,hospital_id,department_id,medicine_name,batch_no,expiry_date,quantity,unit
        FROM pharmacy_stock WHERE id=$1 AND hospital_id=$2 AND active=true FOR UPDATE
      ), upd AS (
        UPDATE pharmacy_stock s SET quantity=s.quantity-$3,updated_at=CURRENT_TIMESTAMP
        FROM locked l WHERE s.id=l.id AND s.quantity >= $3
        RETURNING s.id,s.quantity AS quantity_after,l.quantity AS quantity_before,l.hospital_id,l.department_id,l.medicine_name,l.batch_no,l.expiry_date,l.unit
      ), tr AS (
        INSERT INTO pharmacy_stock_transfers
          (hospital_id,source_stock_id,source_department_id,destination_department_id,medicine_name,batch_no,expiry_date,quantity,unit,status,requested_by,requested_at,notes)
        SELECT hospital_id,id,department_id,$4,medicine_name,batch_no,expiry_date,$3,unit,'in_transit',$5,CURRENT_TIMESTAMP,$6 FROM upd RETURNING *
      ), led AS (
        INSERT INTO pharmacy_stock_transactions
          (hospital_id,stock_id,transaction_type,quantity,quantity_before,quantity_after,performed_by,notes,transfer_id)
        SELECT u.hospital_id,u.id,'transfer_out',$3,u.quantity_before,u.quantity_after,$5,$6,tr.id FROM upd u JOIN tr ON true RETURNING id
      ) SELECT * FROM tr`,[sourceId,ctx.hospitalId,qty,destinationId,actor(ctx),String(b.notes||"").trim()||null]);
    if(!r.rows[0])return res.status(409).json({error:"Insufficient source stock or transfer could not be issued"});
    return res.status(201).json(r.rows[0]);
  }

  const current=await db.query("SELECT * FROM pharmacy_stock_transfers WHERE id=$1 AND hospital_id=$2 FOR UPDATE",[id,ctx.hospitalId]);
  const t=current.rows[0];
  if(!t)return res.status(404).json({error:"Transfer not found"});

  if(action==="receive"){
    if(t.status!=="in_transit")return res.status(409).json({error:"Only in-transit transfers can be received"});
    if(!isAdmin(ctx)&&Number(t.destination_department_id)!==Number(ctx.staff.department_id))return res.status(403).json({error:"Only the destination department can receive this transfer"});
    const r=await db.query(`WITH locked AS (
        SELECT * FROM pharmacy_stock_transfers WHERE id=$1 AND hospital_id=$2 AND status='in_transit' FOR UPDATE
      ), ensure_stock AS (
        INSERT INTO pharmacy_stock(hospital_id,department_id,medicine_name,batch_no,expiry_date,quantity,reorder_level,unit,active)
        SELECT hospital_id,destination_department_id,medicine_name,batch_no,expiry_date,0,0,unit,true FROM locked
        ON CONFLICT DO NOTHING RETURNING id
      ), dest AS (
        SELECT s.id,s.quantity,t.quantity AS transfer_qty,t.hospital_id
        FROM pharmacy_stock s JOIN locked t ON s.hospital_id=t.hospital_id AND s.department_id=t.destination_department_id
          AND s.medicine_name=t.medicine_name AND s.batch_no=t.batch_no
        WHERE s.active=true FOR UPDATE
      ), upd AS (
        UPDATE pharmacy_stock s SET quantity=s.quantity+d.transfer_qty,updated_at=CURRENT_TIMESTAMP
        FROM dest d WHERE s.id=d.id
        RETURNING s.id,d.quantity AS quantity_before,s.quantity AS quantity_after,d.transfer_qty,d.hospital_id
      ), tr AS (
        UPDATE pharmacy_stock_transfers SET status='received',received_by=$3,received_at=CURRENT_TIMESTAMP,receive_notes=$4
        WHERE id=$1 AND hospital_id=$2 AND status='in_transit' RETURNING *
      ), led AS (
        INSERT INTO pharmacy_stock_transactions
          (hospital_id,stock_id,transaction_type,quantity,quantity_before,quantity_after,performed_by,notes,transfer_id)
        SELECT hospital_id,id,'transfer_in',transfer_qty,quantity_before,quantity_after,$3,$4,$1 FROM upd RETURNING id
      ) SELECT * FROM tr`,[id,ctx.hospitalId,actor(ctx),String(b.receive_notes||"").trim()||null]);
    if(!r.rows[0])return res.status(409).json({error:"Transfer was already changed or destination stock is unavailable"});
    return res.json(r.rows[0]);
  }

  if(t.status!=="in_transit")return res.status(409).json({error:"Only in-transit transfers can be cancelled"});
  if(!isAdmin(ctx)&&Number(t.source_department_id)!==Number(ctx.staff.department_id))return res.status(403).json({error:"Only the source department can cancel this transfer"});
  const r=await db.query(`WITH locked AS (
      SELECT * FROM pharmacy_stock_transfers WHERE id=$1 AND hospital_id=$2 AND status='in_transit' FOR UPDATE
    ), src AS (
      SELECT s.id,s.quantity,t.quantity AS transfer_qty,s.quantity AS quantity_before,t.hospital_id
      FROM pharmacy_stock s JOIN locked t ON s.id=t.source_stock_id AND s.hospital_id=t.hospital_id
      WHERE s.active=true FOR UPDATE
    ), upd AS (
      UPDATE pharmacy_stock s SET quantity=s.quantity+x.transfer_qty,updated_at=CURRENT_TIMESTAMP
      FROM src x WHERE s.id=x.id
      RETURNING s.id,x.quantity_before AS quantity_before,s.quantity AS quantity_after,x.transfer_qty,x.hospital_id
    ), tr AS (
      UPDATE pharmacy_stock_transfers SET status='cancelled',cancelled_by=$3,cancelled_at=CURRENT_TIMESTAMP,notes=COALESCE($4,notes)
      WHERE id=$1 AND hospital_id=$2 AND status='in_transit' RETURNING *
    ), led AS (
      INSERT INTO pharmacy_stock_transactions
        (hospital_id,stock_id,transaction_type,quantity,quantity_before,quantity_after,performed_by,notes,transfer_id)
      SELECT hospital_id,id,'transfer_return',transfer_qty,quantity_before,quantity_after,$3,$4,$1 FROM upd RETURNING id
    ) SELECT * FROM tr`,[id,ctx.hospitalId,actor(ctx),String(b.notes||"").trim()||"Transfer cancelled"]);
  if(!r.rows[0])return res.status(409).json({error:"Transfer was already changed or source stock is unavailable"});
  return res.json(r.rows[0]);
}
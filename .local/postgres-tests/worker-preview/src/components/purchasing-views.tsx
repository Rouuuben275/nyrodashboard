"use client";
import { RPilotTextarea } from "./ui/textarea";
import { RPilotInput } from "./ui/input";
import { RPilotSelect } from "./ui/select";
import { useState } from "react";
import {ReceiptForm,ReceiptHistory,receivedQuantity} from "./purchase-receipts";
import { ArrowRight, Check, PackageCheck, Plus, Trash2, Truck } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";
import { useWorkspace, type Current } from "./workspace-context";
import { Modal } from "./ui/dialog";
import { money } from "@/lib/utils";
import { exportCsv } from "@/lib/csv";
type Supplier = Current["suppliers"][number];
type Order = Current["purchaseOrders"][number];
const states: Record<string, string> = { DRAFT: "Brouillon", ORDERED: "Commandée", PARTIAL: "Partiellement reçue", RECEIVED: "Réceptionnée", CANCELLED: "Annulée" };
function Field({ title, children }: { title: string; children: React.ReactNode }) { return <label className="form-field"><span>{title}</span>{children}</label>; }
function Heading({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) { return <div className="page-heading"><div><div className="mini-label">APPROVISIONNEMENT</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>; }
function Actions({ close, error }: { close: () => void; error: string }) { const { busy } = useWorkspace(); return <>{error && <p className="form-error-box" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="btn outline" onClick={close}>Fermer</button><button className="btn primary" disabled={busy}>Enregistrer<Check size={15}/></button></div></>; }

export function Suppliers() {
  const { current: c, allowed } = useWorkspace(); const [editing, setEditing] = useState<Supplier | "new" | null>(null); const [archived, setArchived] = useState(false);
  if (!c) return null;
  const columns: ColumnDef<Supplier>[] = [{ accessorKey: "name", header: "Fournisseur", cell: ({ row }) => <strong>{row.original.name}</strong> }, { accessorKey: "contact", header: "Contact" }, { accessorKey: "phone", header: "Téléphone RP" }, { accessorKey: "email", header: "E-mail" }, { id: "orders", header: "Commandes accessibles", cell: ({ row }) => c.purchaseOrders.filter(o => o.supplierId === row.original.id).length }, { id: "action", header: "", cell: ({ row }) => <button className="btn outline small" onClick={() => setEditing(row.original)}>Ouvrir la fiche</button> }];
  return <><Heading title="Les bons partenaires pour vos stocks." description="Coordonnées, notes et historique des commandes RP, regroupés par fournisseur.">{allowed("suppliers.manage") && <button className="btn primary" onClick={() => setEditing("new")}><Plus size={15}/>Nouveau fournisseur</button>}</Heading><div className="record-filters"><label className="checkbox-label"><RPilotInput type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)}/>Afficher les fournisseurs archivés</label></div><DataTable data={c.suppliers.filter(s => archived || !s.archived)} columns={columns} placeholder="Rechercher un fournisseur ou un contact…"/><Modal open={editing !== null} onOpenChange={v => !v && setEditing(null)} title={editing === "new" ? "Nouveau fournisseur RP" : "Fiche fournisseur"} description="Archiver une fiche conserve les commandes déjà enregistrées.">{editing && <SupplierForm key={typeof editing === "string" ? editing : editing.id} record={editing === "new" ? undefined : editing} close={() => setEditing(null)}/>}</Modal></>;
}
function SupplierForm({ record, close }: { record?: Supplier; close: () => void }) {
  const { current: c, allowed, mutate } = useWorkspace(); const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setError(""); const form = new FormData(e.currentTarget); try { await mutate({ action: "supplier.save", supplierId: record?.id, ...Object.fromEntries(["name", "contact", "phone", "email", "notes"].map(k => [k, String(form.get(k) || "")])), archived: form.get("archived") === "on" }, "Fournisseur enregistré"); close(); } catch (e) { setError(e instanceof Error ? e.message : "Échec"); } }
  return <form className="workspace-form" onSubmit={submit}><fieldset className="form-fieldset" disabled={!allowed("suppliers.manage")}><Field title="Nom du fournisseur"><RPilotInput name="name" maxLength={160} required defaultValue={record?.name}/></Field><Field title="Contact RP"><RPilotInput name="contact" maxLength={160} defaultValue={record?.contact || ""}/></Field><div className="form-grid"><Field title="Téléphone RP"><RPilotInput name="phone" maxLength={60} defaultValue={record?.phone}/></Field><Field title="E-mail de contact"><RPilotInput name="email" type="email" maxLength={254} defaultValue={record?.email}/></Field></div><Field title="Notes internes"><RPilotTextarea name="notes" maxLength={5000} defaultValue={record?.notes}/></Field>{record && <label className="checkbox-label"><RPilotInput type="checkbox" name="archived" defaultChecked={record.archived}/>Archiver le fournisseur</label>}</fieldset>{record && <div className="client-documents"><h3>Historique accessible des commandes</h3>{c?.purchaseOrders.filter(o => o.supplierId === record.id).map(o => <div className="supplier-history-row" key={o.id}><strong>{o.number}</strong><span>{states[o.status]}</span><span>{money(o.total)}</span></div>)}{!c?.purchaseOrders.some(o => o.supplierId === record.id) && <p>Aucune commande accessible pour cette fiche.</p>}</div>}{allowed("suppliers.manage") ? <Actions close={close} error={error}/> : <button className="btn outline" type="button" onClick={close}>Fermer</button>}</form>;
}

export function PurchaseOrders() {
  const {current:c}=useWorkspace();
  return c?<OrdersForCompany key={`${c.company.id}:${c.permissions.join(',')}`}/>:null;
}
function OrdersForCompany() {
  const {current:c,allowed,mutate,busy}=useWorkspace();
  const [editing,setEditing]=useState<Order|"new"|null>(null);
  const [detail,setDetail]=useState<string|null>(null);
  const [filter,setFilter]=useState("");
  const [decision,setDecision]=useState<"RECEIVED"|"CANCELLED"|null>(null);
  const [error,setError]=useState("");
  if(!c)return null;
  const selected=c.purchaseOrders.find(o=>o.id===detail);
  const list=c.purchaseOrders.filter(o=>!filter||o.status===filter);
  async function transition(orderId:string,status:string,reason="") {
    setError("");
    try{await mutate({action:"purchase.transition",orderId,status,reason},"Statut de commande enregistré");setDecision(null);}
    catch(e){setError(e instanceof Error?e.message:"Échec");}
  }
  const columns:ColumnDef<Order>[]=[
    {accessorKey:"number",header:"Bon de commande",cell:({row})=><button className="text-link mono" onClick={()=>setDetail(row.original.id)}>{row.original.number}<ArrowRight size={13}/></button>},
    {accessorKey:"supplierName",header:"Fournisseur"},
    {accessorKey:"total",header:"Coût commandé RP",cell:({row})=><strong>{money(row.original.total)}</strong>},
    {accessorKey:"status",header:"Statut",cell:({row})=><span className="badge neutral">{states[row.original.status]}</span>},
    {id:"received",header:"Unités reçues",cell:({row})=>`${row.original.items.reduce((s,i)=>s+receivedQuantity(row.original,i),0)} / ${row.original.items.reduce((s,i)=>s+i.quantity,0)}`},
    {id:"action",header:"",cell:({row})=><button className="btn outline small" onClick={()=>setDetail(row.original.id)}>Consulter</button>},
  ];
  return <>
    <Heading title="Du fournisseur à votre inventaire." description="Commandes, livraisons partielles et complètes. Seul le coût reçu est enregistré en comptabilité.">{allowed("orders.manage")&&<button className="btn primary" onClick={()=>setEditing("new")}><Plus size={15}/>Nouvelle commande</button>}</Heading>
    <div className="info-note"><Truck size={18}/>Les commandes restent internes à Nyro Dashboard : aucun message n’est envoyé au fournisseur. L’annulation d’un reliquat conserve les livraisons et les dépenses déjà enregistrées.</div>
    <div className="record-filters"><RPilotSelect aria-label="Statut des commandes" value={filter} onValueChange={setFilter}><option value="">Tous les statuts</option>{Object.entries(states).map(([value,label])=><option key={value} value={value}>{label}</option>)}</RPilotSelect><button className="btn outline small" onClick={()=>exportCsv("commandes-achat",[["Référence","Fournisseur","Statut","Coût commandé centimes RP","Coût reçu centimes RP","Réception complète"],...list.map(o=>[o.number,o.supplierName,states[o.status],o.total,o.items.reduce((s,i)=>s+receivedQuantity(o,i)*i.unitCost,0),o.receivedAt||""])])}>Exporter CSV</button></div>
    {c.purchaseOrders.length===500&&<p className="info-note">Les 500 commandes les plus récentes sont chargées. La recherche et le CSV portent sur cette liste.</p>}<DataTable data={list} columns={columns} placeholder="Rechercher une commande, un fournisseur…"/>
    <Modal open={Boolean(editing)} onOpenChange={v=>!v&&setEditing(null)} title="Préparer une commande d’achat RP" description="Les coûts sont exprimés par unité. Le brouillon n’a aucun effet sur le stock." wide>{editing&&<OrderForm key={typeof editing==="string"?editing:editing.id} record={editing==="new"?undefined:editing} close={()=>setEditing(null)}/>}</Modal>
    <Modal open={Boolean(selected)} onOpenChange={v=>{if(!v){setDetail(null);setDecision(null);setError("");}}} title={selected?.number||"Commande"} description="Les références et les coûts sont conservés dans le bon de commande." wide>
      {selected&&<div className="bill-detail">
        <div className="bill-summary"><div><span className="mini-label">FOURNISSEUR RP</span><h3>{selected.supplierName}</h3></div><span className="badge neutral">{states[selected.status]}</span></div>
        <div className="table-scroll"><table><thead><tr><th>Produit</th><th>Commandé</th><th>Reçu</th><th>{selected.status==="CANCELLED"?"Non livré / annulé":"Reste"}</th><th>Coût unitaire RP</th></tr></thead><tbody>{selected.items.map(i=><tr key={i.id}><td>{i.name}</td><td>{i.quantity}</td><td>{receivedQuantity(selected,i)}</td><td>{i.quantity-receivedQuantity(selected,i)}</td><td>{money(i.unitCost)}</td></tr>)}</tbody></table></div>
        <div className="bill-totals"><span>Total commandé RP<strong>{money(selected.total)}</strong></span><span>Coût reçu RP<strong>{money(selected.items.reduce((s,i)=>s+receivedQuantity(selected,i)*i.unitCost,0))}</strong></span></div>
        {selected.notes&&<p className="bill-notes">{selected.notes}</p>}
        {error&&<p className="form-error-box" role="alert">{error}</p>}
        {decision==="RECEIVED"?<ReceiptForm key={selected.id} order={selected} close={()=>setDecision(null)}/>:decision==="CANCELLED"?<form className="workspace-form receipt-confirmation" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void transition(selected.id,"CANCELLED",String(form.get("reason")||""));}}>
          <h3>{selected.status==="PARTIAL"?"Annuler le reliquat non livré":"Annuler cette commande"}</h3><p>Les livraisons, stocks et dépenses déjà enregistrés sont conservés. Cette action ne crée aucun retour ni remboursement.</p>
          <Field title="Motif d’annulation"><RPilotTextarea required minLength={3} maxLength={1000} name="reason"/></Field>
          <label className="checkbox-label"><RPilotInput type="checkbox" required/>Je confirme cette opération RP.</label><div className="form-actions"><button className="btn outline" type="button" onClick={()=>setDecision(null)}>Revenir</button><button className="btn primary" disabled={busy}>Confirmer<Check size={15}/></button></div>
        </form>:<div className="bill-actions">{allowed("orders.manage")&&<>
          {selected.status==="DRAFT"&&<><button className="btn outline" onClick={()=>{setEditing(selected);setDetail(null);}}>Modifier</button><button className="btn primary" disabled={busy} onClick={()=>transition(selected.id,"ORDERED")}>Confirmer la commande</button></>}
          {["ORDERED","PARTIAL"].includes(selected.status)&&allowed("inventory.manage")&&allowed("finance.read")&&<button className="btn primary" onClick={()=>{setError("");setDecision("RECEIVED");}}><PackageCheck size={16}/>Enregistrer une livraison</button>}
          {["DRAFT","ORDERED","PARTIAL"].includes(selected.status)&&<button className="btn outline" onClick={()=>{setError("");setDecision("CANCELLED");}}>{selected.status==="PARTIAL"?"Annuler le reliquat":"Annuler la commande"}</button>}
        </>}</div>}
        <ReceiptHistory key={selected.id} companyId={c.company.id} orderId={selected.id} version={selected.updatedAt}/>
      </div>}
    </Modal>
  </>;
}

function OrderForm({ record, close }: { record?: Order; close: () => void }) {
  const { current: c, mutate } = useWorkspace(); const [error, setError] = useState("");
  const [lines, setLines] = useState(() => record ? record.items.map(i => ({ key: i.id, productId: i.productId, quantity: String(i.quantity), cost: (i.unitCost / 100).toFixed(2) })) : [{ key: crypto.randomUUID(), productId: "", quantity: "1", cost: "0.00" }]);
  const update = (key: string, patch: Partial<(typeof lines)[number]>) => setLines(rows => rows.map(i => i.key === key ? { ...i, ...patch } : i));
  const products = c?.products.filter(p => p.trackStock && !p.archived) || [];
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setError(""); const form = new FormData(e.currentTarget); try { const items = lines.map(i => { if (!/^\d+(\.\d{1,2})?$/.test(i.cost)) throw new Error("Utilisez au maximum deux décimales pour les coûts."); const [whole, fraction = ""] = i.cost.split("."); return { productId: i.productId, quantity: Number(i.quantity), unitCost: Number(whole) * 100 + Number(fraction.padEnd(2, "0")) }; }); await mutate({ action: "purchase.save", orderId: record?.id, supplierId: form.get("supplierId"), notes: form.get("notes"), items }, "Bon de commande enregistré"); close(); } catch (e) { setError(e instanceof Error ? e.message : "Échec"); } }
  return <form className="workspace-form" onSubmit={submit}><Field title="Fournisseur RP"><RPilotSelect name="supplierId" required defaultValue={record?.supplierId || ""}><option value="" disabled>Choisir un fournisseur actif</option>{c?.suppliers.filter(s => !s.archived).map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</RPilotSelect></Field>{(!products.length || !c?.suppliers.some(s => !s.archived)) && <p className="info-note"><Truck size={17}/>Ajoutez un fournisseur actif et des produits avec suivi de stock avant de préparer une commande.</p>}<div className="bill-line-list">{lines.map((line, i) => <div className="bill-line" key={line.key}><Field title={`Produit ${i + 1}`}><RPilotSelect required value={line.productId} onValueChange={value => { const product = products.find(p => p.id === value); update(line.key, { productId: value, cost: ((product?.cost || 0) / 100).toFixed(2) }); }}><option value="" disabled>Choisir une référence</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</RPilotSelect></Field><Field title="Quantité"><RPilotInput type="number" min="1" max="10000" step="1" required value={line.quantity} onChange={e => update(line.key, { quantity: e.target.value })}/></Field><Field title="Coût unitaire ($ RP)"><RPilotInput type="number" min="0" max="1000000" step="0.01" required value={line.cost} onChange={e => update(line.key, { cost: e.target.value })}/></Field><button className="icon-btn" type="button" aria-label={`Retirer la ligne ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines(rows => rows.filter(r => r.key !== line.key))}><Trash2 size={16}/></button></div>)}</div><button type="button" className="btn outline small" disabled={lines.length >= 100} onClick={() => setLines(rows => [...rows, { key: crypto.randomUUID(), productId: "", quantity: "1", cost: "0.00" }])}><Plus size={14}/>Ajouter une référence</button><div className="bill-estimate"><small>Total achat RP estimé</small><strong>{money(Math.round(lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.cost || 0) * 100, 0)))}</strong></div><Field title="Notes du bon de commande"><RPilotTextarea name="notes" maxLength={5000} defaultValue={record?.notes}/></Field><Actions close={close} error={error}/></form>;
}

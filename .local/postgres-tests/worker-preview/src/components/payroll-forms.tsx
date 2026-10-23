"use client";
import {useState,type ReactNode} from "react";
import type {Serialized} from "@/domains/core/queries";
import type {PayrollData} from "@/domains/payroll/queries";
import {useWorkspace} from "./workspace-context";
import {RPilotInput} from "./ui/input";
import {RPilotSelect} from "./ui/select";
import {RPilotTextarea} from "./ui/textarea";
import {RPilotDatePicker} from "./ui/date-picker";
export type PayData=Serialized<PayrollData>;
export type PayOperation="run"|"prepare"|"approve"|"reopen"|"pay"|"cancel"|"policy-member"|"policy-role";
export const payLabels:Record<PayOperation,string>={run:"Créer une période",prepare:"Calculer le bulletin",approve:"Valider le bulletin",reopen:"Rouvrir le bulletin",pay:"Verser le net RP",cancel:"Annuler la période", "policy-member":"Rémunération individuelle","policy-role":"Rémunération par grade"};
export function PayField({label,children}:{label:string;children:ReactNode}){return <label className="form-field"><span>{label}</span>{children}</label>;}
export function PayrollForm({data,operation,targetId,onDone,onCancel}:{data:PayData;operation:PayOperation;targetId:string;onDone:(r:Record<string,unknown>)=>void;onCancel:()=>void}){
  const {mutate,busy}=useWorkspace();const [error,setError]=useState("");const [requestKey]=useState(()=>crypto.randomUUID());const [roleId,setRoleId]=useState(data.roles[0]?.id??"");
  const isPolicy=operation.startsWith("policy"),selectedId=operation==="policy-member"?targetId:roleId;
  const policy=data.policies.find(p=>p.targetKey===`${operation==="policy-member"?"MEMBER":"ROLE"}:${selectedId}`);
  const person=data.staff.find(s=>s.id===targetId),slip=data.selected;
  return <form className="workspace-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const value=(key:string)=>String(f.get(key)??"");const number=(key:string)=>Number(value(key));const cents=(key:string)=>Math.round(number(key)*100);setError("");
    try{
      let payload:Record<string,unknown>;
      if(isPolicy)payload={action:"payroll.policy",target:operation==="policy-member"?"MEMBER":"ROLE",targetId:selectedId,revision:policy?.revision,mode:value("mode"),rate:cents("rate"),regularMinutes:number("regularMinutes"),overtimeBps:Math.round(number("overtimePercent")*100),commissionBps:Math.round(number("commissionPercent")*100)};
      else if(operation==="run")payload={action:"payroll.run",label:value("label"),from:value("from"),to:value("to")};
      else if(operation==="prepare")payload={action:"payroll.prepare",runId:data.run!.id,memberId:slip?.memberId??targetId,revision:slip?.revision,bonus:cents("bonus"),deduction:cents("deduction"),note:value("note")};
      else if(operation==="cancel")payload={action:"payroll.cancel",runId:data.run!.id,reason:value("reason")};
      else if(operation==="pay")payload={action:"payroll.pay",slipId:slip!.id,revision:slip!.revision,accountId:value("accountId")};
      else payload={action:"payroll.review",slipId:slip!.id,revision:slip!.revision,decision:operation==="approve"?"APPROVE":"REOPEN",reason:value("reason")};
      onDone(await mutate({...payload,requestKey}));
    }catch(e){setError(e instanceof Error?e.message:"Opération impossible.");}
  }}>
    {operation==="run"&&<><PayField label="Libellé"><RPilotInput name="label" required minLength={3} maxLength={120} placeholder="Paie de septembre"/></PayField><div className="form-row"><PayField label="Du, inclus"><RPilotDatePicker name="from" required/></PayField><PayField label="Au, inclus"><RPilotDatePicker name="to" required/></PayField></div><p>Dates de Paris, 62 jours maximum. Les périodes actives ne peuvent pas se chevaucher.</p></>}
    {isPolicy&&<>
      {operation==="policy-role"?<PayField label="Grade"><RPilotSelect value={roleId} onValueChange={setRoleId} options={data.roles.map(r=>({value:r.id,label:r.name}))}/></PayField>:<p><strong>{person?.characterName}</strong> · la règle individuelle est prioritaire sur celle du grade.</p>}
      <PolicyFields key={`${selectedId}:${policy?.revision??"new"}`} policy={policy} salary={person?.salary??0}/>
      <p className="finance-note">Sans règle individuelle ni règle de grade, le salaire de la fiche employé devient un forfait pour la période. Les règles ne recalculent aucun bulletin automatiquement.</p>
    </>}
    {operation==="prepare"&&<>
      <p><strong>{slip?.employeeName??person?.characterName}</strong> · {data.run?.label}</p>
      <p>Seuls les services terminés et validés dont le début appartient à la période sont retenus. Un service traversant sa fin est refusé. Le forfait couvre la période entière, sans prorata automatique.</p>
      <div className="form-row"><PayField label="Prime RP"><RPilotInput name="bonus" type="number" min={0} max={1000000} step="0.01" required defaultValue={(slip?.bonus??0)/100}/></PayField><PayField label="Retenue RP"><RPilotInput name="deduction" type="number" min={0} max={1000000} step="0.01" required defaultValue={(slip?.deduction??0)/100}/></PayField></div>
      <PayField label="Motif des ajustements / note visible sur le bulletin"><RPilotTextarea name="note" maxLength={1000} defaultValue={slip?.note??""}/></PayField>
      <p>Le calcul est enregistré en brouillon et reste à valider. Les commissions portent sur les ventes terminées du vendeur pendant la période.</p>
    </>}
    {operation==="pay"&&<><PayField label="Compte RP à débiter"><RPilotSelect name="accountId" required options={data.accounts.map(a=>({value:a.id,label:a.name}))}/></PayField><p>Le versement crée une seule écriture comptable et fige le bulletin. Le solde disponible est vérifié côté serveur. Aucun virement bancaire réel.</p></>}
    {["approve","reopen","cancel"].includes(operation)&&<><PayField label="Motif"><RPilotTextarea name="reason" required minLength={3} maxLength={1000}/></PayField><p>{operation==="approve"?"La validation fige les pointages utilisés. Vos propres bulletins doivent être validés par un autre responsable.":operation==="cancel"?"Tous les bulletins non versés sont annulés et conservés. Une période contenant un versement ne peut pas être annulée.":"Le bulletin redevient un brouillon. Les décisions précédentes restent dans son historique."}</p></>}
    {!isPolicy&&<label className="checkbox-label"><RPilotInput type="checkbox" required/>Je confirme cette opération RP.</label>}
    {error&&<p className="form-error-box" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="btn outline" disabled={busy} onClick={onCancel}>Revenir</button><button className="btn primary" disabled={busy||isPolicy&&!selectedId}>{busy?"Enregistrement…":payLabels[operation]}</button></div>
  </form>;
}
function PolicyFields({policy,salary}:{policy:PayData["policies"][number]|undefined;salary:number}){
  return <><PayField label="Mode de rémunération"><RPilotSelect name="mode" defaultValue={policy?.mode??"FIXED"} options={[{value:"FIXED",label:"Forfait pour la période"},{value:"HOURLY",label:"Taux horaire"}]}/></PayField>
    <PayField label="Forfait ou taux horaire RP"><RPilotInput name="rate" type="number" min={0} max={1000000} step="0.01" required defaultValue={(policy?.rate??salary)/100}/></PayField>
    <PayField label="Seuil de minutes normales par période"><RPilotInput name="regularMinutes" type="number" min={0} max={90000} step={1} required defaultValue={policy?.regularMinutes??2100}/></PayField>
    <PayField label="Rémunération des heures supplémentaires, en % du taux horaire"><RPilotInput name="overtimePercent" type="number" min={100} max={500} step="0.01" required defaultValue={(policy?.overtimeBps??12500)/100}/></PayField>
    <PayField label="Commission sur les ventes, en %"><RPilotInput name="commissionPercent" type="number" min={0} max={100} step="0.01" required defaultValue={(policy?.commissionBps??0)/100}/></PayField>
    <p>Le seuil s’applique à cette période entière. La majoration ne s’ajoute qu’aux salaires horaires ; le forfait reste fixe.</p></>;
}

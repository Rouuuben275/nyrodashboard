"use client";
import { RPilotTextarea } from "./ui/textarea";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock3, GraduationCap, NotebookPen, UserRound } from "lucide-react";
import type { EmployeeDossier } from "@/domains/hr/service";
import type { Serialized } from "@/domains/core/queries";
import { money } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";
import { RPilotDialog } from "./ui/dialog";
import { RPilotTabs, RPilotSkeleton } from "./ui/primitives";
import { RPilotInput } from "./ui/input";
import { RPilotSelect } from "./ui/select";
import {PeopleView} from "./people-view";
import {RecordAttachments} from "./record-attachments";
type Dossier = Serialized<EmployeeDossier>;
const date = (v: string) => new Date(v).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const labels: Record<string, string> = { NOTE: "Note interne", TRAINING: "Formation", CERTIFICATION: "Certification", CAREER: "Étape de carrière", GRADE: "Grade", DEPARTMENT: "Département", STATUS: "Statut", PROFILE: "Informations RP" };
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="form-field"><span>{label}</span>{children}</label>; }
export function EmployeeDossierModal({ memberId, close }: { memberId: string; close: () => void }) {
  const { current: c, mutate, busy, allowed, open } = useWorkspace();
  const [data, setData] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [activeTab,setActiveTab]=useState("info");
  const companyId = c!.company.id;
  const member = c?.members.find(m => m.id === memberId);
  const accessVersion = `${c!.permissions.toSorted().join("|")}:${c!.company.modules.map(m => `${m.key}:${m.enabled}`).toSorted().join("|")}`;
  const load = useCallback(async (signal: AbortSignal, cursor?: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/employees?${new URLSearchParams({ companyId, memberId, ...(cursor ? { cursor } : {}) })}`, { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!signal.aborted) setData(previous => cursor && previous ? { ...result, events: [...previous.events, ...result.events] } : result);
    } catch (e) { if (!signal.aborted) setError(e instanceof Error ? e.message : "Chargement impossible."); }
    finally { if (!signal.aborted) setLoading(false); }
  }, [companyId, memberId]);
  useEffect(() => { const controller = new AbortController(); setData(null); void load(controller.signal); return () => controller.abort(); }, [load, revision, member?.roleId, member?.department, member?.status, accessVersion]);
  const refresh = () => setRevision(v => v + 1);
  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); const form = new FormData(e.currentTarget);
    try { await mutate({ action: "employee.profile", memberId, ...Object.fromEntries(["characterName", "phone", "jobTitle", "biography"].map(key => [key, String(form.get(key) || "")])) }, "Informations RP enregistrées"); refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Enregistrement impossible."); }
  }
  const events = (kinds?: string[]) => <div className="employee-timeline">{data?.events.filter(e => !kinds || kinds.includes(e.kind)).map(e => <article key={e.id}><span className="badge neutral">{labels[e.kind] || e.kind}</span><h3>{e.title}</h3><p>{e.content}</p><small>{e.actorName} · {date(e.createdAt)}</small></article>)}{!data?.events.some(e => !kinds || kinds.includes(e.kind)) && <p className="muted">Aucun élément dans les pages chargées.</p>}{data?.nextCursor && <button className="btn outline small" disabled={loading} onClick={() => void load(new AbortController().signal, data.nextCursor!)}>Charger les éléments précédents</button>}</div>;
  const tabs = data ? [
    ...(data.permissions.documents?[{value:"documents",label:"Documents privés",content:<RecordAttachments targetType="EMPLOYEE" targetId={memberId}/>}]:[]),
    { value: "info", label: "Informations", content: <><div className="employee-summary"><span className="empty-icon"><UserRound size={25}/></span><div><h3>{data.target.characterName}</h3><p>{data.target.role.name} · {data.target.department}</p><small>Depuis le {new Date(data.target.hiredAt).toLocaleDateString("fr-FR")} · {data.target.status === "ACTIVE" ? "Actif" : "Inactif"}</small></div>{member && !member.role.isOwner && allowed("employees.manage") && <button className="btn outline small" onClick={() => open("member", member)}>Grade et affectation</button>}</div>{data.manager ? <form className="workspace-form" onSubmit={saveProfile}><div className="form-grid"><Field label="Nom du personnage RP"><RPilotInput name="characterName" required maxLength={160} defaultValue={data.target.characterName}/></Field><Field label="Fonction RP"><RPilotInput name="jobTitle" maxLength={160} defaultValue={data.target.profile?.jobTitle}/></Field></div><Field label="Téléphone RP (dossier RH)"><RPilotInput name="phone" maxLength={60} defaultValue={"phone" in (data.target.profile || {}) ? String((data.target.profile as {phone:string}).phone) : ""}/></Field><Field label="Présentation du personnage (dossier RH)"><RPilotTextarea name="biography" maxLength={3000} defaultValue={"biography" in (data.target.profile || {}) ? String((data.target.profile as {biography:string}).biography) : ""}/></Field><button className="btn primary" disabled={busy}>Enregistrer les informations</button></form> : <p>Fonction : {data.target.profile?.jobTitle || "Non renseignée"}</p>}</> },
    { value: "career", label: "Carrière", content: <>{events(["TRAINING", "CERTIFICATION", "CAREER", "GRADE", "DEPARTMENT", "STATUS"])}{data.manager && <EventForm memberId={memberId} refresh={refresh}/>}</> },
    ...(data.permissions.planning ? [{ value: "planning", label: "Planning", content: <div className="employee-list"><p>{data.totalShifts} service(s) à venir · 30 affichés au maximum.</p>{data.shifts.map(s => <article key={s.id}><CalendarDays size={16}/><div><strong>{s.title}</strong><small>{date(s.start)} → {date(s.end)}</small></div></article>)}{!data.shifts.length && <p>Aucun service à venir.</p>}</div> }] : []),
    ...(data.permissions.time ? [{ value: "hours", label: "Heures", content: <div className="employee-list"><p>{data.stats?.completedServices} service(s) terminés · {Math.floor((data.stats?.minutes || 0) / 60)} h {(data.stats?.minutes || 0) % 60} min nettes pointées au total, pauses déduites.</p>{data.timeEntries.map(t => <article key={t.id}><Clock3 size={16}/><div><strong>{date(t.start)}</strong><small>{t.end ? `Fin : ${date(t.end)} · ${t.minutes} min nettes${t.corrected?" · horaires corrigés":""}` : "En cours"}</small></div></article>)}<p>Les 30 derniers pointages sont affichés.</p></div> }] : []),
    ...(data.manager ? [{ value: "pay", label: "Base salariale", content: <p>Base renseignée : <strong>{money(data.target.salary || 0)} RP</strong>. Cette valeur provient du dossier employé ; elle ne constitue pas un versement.</p> }, { value: "notes", label: "Notes internes", content: <>{events(["NOTE"])}<EventForm memberId={memberId} refresh={refresh} note/></> }] : []),
    ...(data.permissions.reviews?[{value:"reviews",label:"Évaluations",content:<PeopleView kind="REVIEW" memberId={memberId} compact/>}]:[]),
    ...(data.permissions.sanctions?[{value:"sanctions",label:"Sanctions RP",content:<PeopleView kind="SANCTION" memberId={memberId} compact/>}]:[]),
    { value: "history", label: "Historique", content: <><p>{data.totalEvents} élément(s) accessibles. Les changements antérieurs à l’installation du suivi ne sont pas reconstruits.</p>{events()}</> },
  ] : [];
  return <RPilotDialog title={data?.target.characterName || "Dossier employé"} description="Informations et historique accessibles selon vos permissions dans cette entreprise." open onOpenChange={v => !v && close()} wide preventClose={busy}>{error && <div className="form-error-box" role="alert">{error}<button className="btn outline small" onClick={refresh}>Réessayer</button></div>}{!data && loading ? <RPilotSkeleton lines={6}/> : data ? <RPilotTabs value={tabs.some(t=>t.value===activeTab)?activeTab:"info"} onValueChange={setActiveTab} aria-label="Dossier employé" tabs={tabs}/> : null}</RPilotDialog>;
}
function EventForm({ memberId, refresh, note }: { memberId: string; refresh: () => void; note?: boolean }) {
  const { mutate, busy } = useWorkspace(); const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); const element = e.currentTarget; const form = new FormData(element);
    try { await mutate({ action: "employee.event", memberId, kind: note ? "NOTE" : form.get("kind"), title: form.get("title"), content: form.get("content") }, "Élément ajouté au dossier"); element.reset(); refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Enregistrement impossible."); }
  }
  return <form className="workspace-form employee-event-form" onSubmit={submit}><h3>{note ? <NotebookPen size={17}/> : <GraduationCap size={17}/>}Ajouter {note ? "une note interne" : "une étape"}</h3>{!note && <Field label="Type"><RPilotSelect name="kind" options={["TRAINING", "CERTIFICATION", "CAREER"].map(value => ({ value, label: labels[value] }))}/></Field>}<Field label="Titre"><RPilotInput name="title" required maxLength={160}/></Field><Field label="Contenu"><RPilotTextarea name="content" required minLength={3} maxLength={5000}/></Field><p className="muted">L’auteur et la date sont conservés. Les textes sont réservés aux responsables RH.</p>{error && <p role="alert" className="form-error-box">{error}</p>}<button className="btn primary" disabled={busy}>Ajouter au dossier</button></form>;
}

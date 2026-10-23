"use client";
import {ExpensesView} from "./expenses-view";
import {StatisticsView} from "./statistics-view";
import {EquipmentView} from "./equipment-view";
import {MessagesView} from "./messages-view";
import {CashView} from "./cash-view";
import {SalesHistory} from "./sales-history";
import {CalendarView} from "./calendar-view";
import {AnnouncementsView} from "./announcements-view";
import {RecruitmentView} from "./recruitment-view";
import {LeavesView} from "./leaves-view";
import {TimeView} from "./time-view";
import {PayrollView} from "./payroll-view";
import {NotificationsView} from "./notifications-view";
import {DocumentsView} from "./documents-view";
import {TasksView} from "./tasks-view";
import {PeopleView} from "./people-view";
import { InventoryView } from "./inventory-view";
import { FinanceView } from "./finance-view";
import { incomeKinds, expenseKinds } from "@/domains/finance/constants";
import { RolesView } from "./roles-view";
import { EmployeeDossierModal } from "./employee-dossier";
import { RPilotInput } from "./ui/input";
import { RPilotSelect } from "./ui/select";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addDays, addWeeks, endOfWeek, format, isSameDay, startOfWeek, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Activity, ArrowDownLeft, ArrowDownRight, ArrowRight, ArrowUpRight, ArrowUpRightSquare, Banknote, Boxes, Building2, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, Circle, Clock3, CreditCard, Download, FileText, Globe2, LayoutGrid, ListFilter, MoreHorizontal, Package, Plus, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, TrendingUp, Users, Wallet, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { modules } from "@/domains/modules/registry";
import { readLimits } from "@/domains/core/limits";
import { initials, money } from "@/lib/utils";
import { exportCsv } from "@/lib/csv";
import { DataTable } from "./data-table";
import { useWorkspace, type Current, type FormKind } from "./workspace-context";
import { Billing, Clients } from "./commerce-views";
import {CompanyCard} from "./company-card";
import {EntityLogo} from "./entity-logo";
import {AuditView} from "./audit-view";
import { ProductsView } from "./products-view";
import { PlanningView } from "./planning-view";
import { Suppliers, PurchaseOrders } from "./purchasing-views";

const dt = (value: string) => new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
const tm = (value: string) => new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const statusLabels: Record<string, string> = { ACTIVE: "Actif", INACTIVE: "Inactif", COMPLETED: "Terminée", CANCELLED: "Annulée", PENDING: "En attente", APPROVED: "Validée", DECLINED: "Refusée", ACCEPTED: "Acceptée", TODO: "À faire", DONE: "Terminée" };
function Badge({ status }: { status: string }) { return <span className={`badge ${["ACTIVE", "COMPLETED", "APPROVED", "ACCEPTED", "DONE"].includes(status) ? "green" : status === "PENDING" ? "amber" : "neutral"}`}><span/>{statusLabels[status] || status}</span>; }
function Avatar({ name, index = 0 }: { name: string; index?: number }) { return <span className={`avatar avatar-${index % 5}`}>{initials(name)}</span>; }
function Empty({ icon: Icon = Boxes, title, description, action, onAction }: { icon?: LucideIcon; title: string; description: string; action?: string; onAction?: () => void }) { return <div className="empty"><span className="empty-icon"><Icon size={26}/></span><h3>{title}</h3><p>{description}</p>{action && <button className="btn primary" onClick={onAction}><Plus size={15}/>{action}</button>}</div>; }
function Heading({ eyebrow, title, subtitle, action, onAction, children }: { eyebrow?: string; title: string; subtitle: string; action?: string; onAction?: () => void; children?: React.ReactNode }) { return <div className="page-heading"><div>{eyebrow && <div className="mini-label">{eyebrow}</div>}<h1>{title}</h1><p>{subtitle}</p></div><div className="heading-actions">{children}{action && <button className="btn primary" onClick={onAction}><Plus size={16}/>{action}</button>}</div></div>; }
export function WorkspaceViews() {
  const { current, view, open, data, allowed } = useWorkspace();
  if (view === "notifications") return <NotificationsView/>;
  if (view === "servers") return <Servers/>;
  if (view === "companies") return <Companies/>;
  if (view === "subscription") return <Subscription/>;
  if (!current) return <><Heading eyebrow="BIENVENUE À BORD" title="Votre prochaine aventure commence ici." subtitle="Un espace pour votre entreprise. Une équipe prête à écrire son histoire."/><div className="onboarding-grid"><button className="panel onboarding-card" onClick={() => open("company")}><span className="empty-icon"><Building2 size={30}/></span><h2>Créer mon entreprise</h2><p>Garage, restaurant ou projet inédit : construisez un espace à votre image.</p><span>Prendre les commandes <ArrowRight size={17}/></span></button><button className="panel onboarding-card" onClick={() => window.location.assign("/espaces")}><span className="empty-icon"><Globe2 size={30}/></span><h2>Fédérer ma communauté</h2><p>Rassemblez plusieurs entreprises dans un espace serveur RP, sans installation.</p><span>Choisir mon espace RP <ArrowRight size={17}/></span></button></div>{data.invitations.length > 0 && <div className="panel padded"><h3>Vos invitations</h3>{data.invitations.map(i => <p key={i.id}>{i.company.name} · {i.role.name} — utilisez le lien partagé par votre responsable pour rejoindre l’équipe.</p>)}</div>}</>;
  if (view === "modules") return allowed("modules.manage") ? <ModuleCatalog/> : <AccessDenied/>;
  if (view === "settings") return allowed("company.manage") ? <Settings/> : <AccessDenied/>;
  const definition = modules.find(m => m.key === view);
  if (!definition || !allowed(definition.permission) || !current.company.modules.some(m => m.key === view && m.enabled)) return <AccessDenied/>;
  switch (view) {
    case "calendar": return <CalendarView key={`${current.company.id}:${current.permissions.join("|")}`}/>;
    case "announcements": return <AnnouncementsView key={`${current.company.id}:${current.permissions.join("|")}`}/>;
    case "reviews": return <PeopleView key={`${current.company.id}:${current.permissions.join("|")}:reviews`} kind="REVIEW"/>;
    case "sanctions": return <PeopleView key={`${current.company.id}:${current.permissions.join("|")}:sanctions`} kind="SANCTION"/>;
    case "payroll": return <PayrollView key={`${current.company.id}:${current.permissions.join("|")}`}/>;
    case "dashboard": return <Dashboard/>;
    case "employees": return <Employees/>;
    case "roles": return <Roles/>;
    case "planning": return <PlanningView/>;
    case "time": return <TimeEntries/>;
    case "recruitment": return <RecruitmentView/>;
    case "leaves": return <Leaves/>;
    case "cash": return <CashView key={`${current.company.id}:${current.permissions.join("|")}`}/>;
    case "sales": return <Sales/>;
    case "finance": return <Finance/>;
    case "expenses": return <ExpensesView/>;
    case "products": return <ProductsView/>;
    case "inventory": return <Inventory/>;
    case "statistics": return <StatisticsView key={`${current.company.id}:${current.permissions.join("|")}`}/>;
    case "equipment": return <EquipmentView key={`${current.company.id}:${current.permissions.join("|")}`}/>;
    case "messages": return <MessagesView key={`${current.company.id}:${current.permissions.join("|")}`}/>;
    case "documents": return <DocumentsView key={`${current.company.id}:${current.permissions.join("|")}`}/>;
    case "tasks": return <TasksView key={`${current.company.id}:${current.permissions.join("|")}`}/>;
    case "audit": return <Audit/>;
    case "crm": return <Clients/>;
    case "quotes": return <Billing kind="QUOTE"/>;
    case "invoices": return <Billing kind="INVOICE"/>;
    case "suppliers": return <Suppliers/>;
    case "orders": return <PurchaseOrders/>;
  }
}
function AccessDenied() { return <Empty icon={ShieldCheck} title="Cet espace n’est pas accessible." description="Votre grade ou les modules de l’entreprise ne permettent pas d’afficher cette page."/>; }
function Dashboard() {
  const { current: c, user, open, navigate, allowed } = useWorkspace();
  const [days, setDays] = useState(30);
  const chartData = useMemo(() => Array.from({ length: days }, (_, i) => {
    const date = subDays(new Date(), days - i - 1); const key = format(date, "yyyy-MM-dd");
    const entries = c!.stats.daily.filter(d => d.date === key);
    return { date: format(date, "dd MMM", { locale: fr }), revenue: entries.filter(e => incomeKinds.includes(e.kind)).reduce((s, e) => s + e.amount / 100, 0), expenses: -entries.filter(e => expenseKinds.includes(e.kind)).reduce((s, e) => s + e.amount / 100, 0) };
  }), [c, days]);
  if (!c) return null;
  const ownMember = c.members.find(m => m.userId === user.id);
  const revenue = c.stats.revenue ?? 0;
  const previous = c.stats.previousRevenue ?? 0;
  const growth = previous > 0 ? Math.round((revenue - previous) / previous * 100) : null;
  const lowStock = c.products.filter(p => !p.archived && p.trackStock && p.stock <= p.threshold);
  const online = c.timeEntries.filter(t => !t.end);
  const myService = online.some(t => t.memberId === c.memberId);
  const date = format(new Date(), "EEEE d MMMM yyyy", { locale: fr });
  return <><div className="dashboard-intro"><div className="intro-copy"><div className="mini-label"><span className="status-dot"/> VOTRE ENTREPRISE, SOUS CONTRÔLE</div><h1>Bonjour, {(ownMember?.characterName || user.name).split(" ")[0]} <span className="wave">✳</span></h1><p>Voici ce qui se passe chez {c.company.name} aujourd’hui.</p></div><div className="intro-actions"><span className="date-label"><CalendarDays size={14}/>{date}</span><div><button className="btn outline" onClick={() => exportCsv("synthese-rp", [["Indicateur", "Montant (centimes RP)"], ["Solde", c.balance ?? "Accès non autorisé"], ["CA du mois", c.stats.revenue ?? "Accès non autorisé"], ["Dépenses du mois", -(c.stats.expenses || 0)]])}><Download size={15}/>Exporter</button>{allowed("sales.create") && <button className="btn primary" onClick={() => open("sale")}><Plus size={16}/>Nouvelle vente</button>}</div></div></div>
    <div className="dashboard-tabs"><button className="selected">Vue d’ensemble</button><button onClick={() => navigate("tasks")}>Mon activité</button><div><span className="status-dot"/>Données actualisées</div></div>
    <div className="stats-grid"><Kpi label="Solde de l’entreprise" value={c.balance === null ? "Accès restreint" : money(c.balance)} icon={Wallet} foot="Solde comptable virtuel RP" note="Toutes les écritures"/><Kpi label="Chiffre d’affaires" value={c.stats.revenue === null ? "Accès restreint" : money(revenue)} icon={TrendingUp} foot={growth === null ? "Premières performances" : `${growth > 0 ? "+" : ""}${growth} % vs mois précédent`} positive={growth !== null && growth >= 0} note="Ce mois-ci"/><Kpi label="Ventes réalisées" value={c.stats.totalSales === null ? "—" : c.stats.totalSales.toLocaleString("fr-FR")} icon={ShoppingBag} foot="Transactions enregistrées" note="Ce mois-ci"/><Kpi label="Effectif actif" value={c.stats.totalMembers === null ? "—" : String(c.stats.totalMembers).padStart(2, "0")} icon={Users} foot={`${online.length} en service actuellement`} positive note="Votre équipe"/></div>
    <div className="dashboard-main-grid"><section className="panel revenue-panel"><div className="panel-title"><div><h3>Performance financière</h3><p>Un aperçu de vos revenus et dépenses.</p></div><RPilotSelect aria-label="Période du graphique" value={String(days)} onValueChange={value => setDays(Number(value))}><option value={7}>7 derniers jours</option><option value={30}>30 derniers jours</option><option value={90}>90 derniers jours</option></RPilotSelect></div><div className="chart-summary"><div><small>Revenus sur la période</small><strong>{money(Math.round(chartData.reduce((sum, d) => sum + d.revenue, 0) * 100))}</strong></div><div className="chart-legend"><span><i className="blue"/>Revenus</span><span><i className="muted"/>Dépenses</span></div></div><div className="revenue-chart">{c.balance === null ? <Empty icon={ShieldCheck} title="Indicateurs financiers indisponibles" description="La comptabilité doit être activée et votre grade doit autoriser sa consultation."/> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, left: -12, right: 12, bottom: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5"/><XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={45} dy={10}/><YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k $` : `${v} $`}/><Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12 }} formatter={v => money(Number(v) * 100)}/><Area type="monotone" name="Revenus" dataKey="revenue" stroke="var(--text)" fill="var(--text)" fillOpacity={0.13} strokeWidth={2.2}/><Area type="monotone" name="Dépenses" dataKey="expenses" stroke="var(--muted)" fill="transparent" strokeWidth={1.5} strokeDasharray="5 5"/></AreaChart></ResponsiveContainer>}</div><div className="chart-footer"><ShieldCheck size={13}/>Des données issues de votre journal financier RP.<button onClick={() => navigate("finance")}>Voir la comptabilité<ArrowUpRight size={13}/></button></div></section>
    <section className="panel activity-panel"><div className="panel-title"><div><h3>Activité récente</h3><p>La vie de votre entreprise.</p></div><span className="subtle-icon"><Activity size={17}/></span></div><div className="activity-list">{c.audit.slice(0, 5).map((a, i) => <div className="activity-item" key={a.id}><span className={`activity-icon activity-${i % 3}`}>{a.action.includes("Vente") ? <ShoppingBag size={15}/> : a.action.includes("service") ? <Clock3 size={15}/> : <FileText size={15}/>}</span><div><strong>{a.action}</strong><p>{a.actorName}</p><small>{dt(a.createdAt)} à {tm(a.createdAt)}</small></div></div>)}{!c.audit.length && <div className="empty compact"><Activity size={26}/><p>Les actions autorisées apparaîtront ici.</p></div>}</div><button className="panel-bottom-link" onClick={() => navigate("audit")}>Tout l’historique<ArrowRight size={14}/></button></section></div>
    <div className="dashboard-bottom-grid"><section className="panel transactions-panel"><div className="panel-title"><div><h3>Dernières transactions <span className="count-badge">{c.sales.length}</span></h3><p>Les dernières ventes enregistrées par votre équipe.</p></div><button className="text-link" onClick={() => navigate("sales")}>Toutes les ventes<ArrowUpRight size={14}/></button></div><div className="table-scroll"><table><thead><tr><th>TRANSACTION</th><th>CLIENT</th><th>VENDEUR</th><th>MONTANT</th><th>STATUT</th></tr></thead><tbody>{c.sales.slice(0, 4).map((s, i) => <tr key={s.id}><td><span className="transaction-ref"><span className="transaction-icon"><ArrowDownLeft size={16}/></span><span><strong>{s.number}</strong><small>{dt(s.createdAt)} · {tm(s.createdAt)}</small></span></span></td><td>{s.customer}</td><td><span className="person-cell"><Avatar name={s.sellerName} index={i}/>{s.sellerName}</span></td><td className="amount-cell">{money(s.total)}</td><td><Badge status={s.status}/></td></tr>)}</tbody></table>{!c.sales.length && <Empty icon={ShoppingBag} title="Votre première vente vous attend." description="Ajoutez une prestation au catalogue, puis ouvrez la caisse." action={allowed("sales.create") ? "Enregistrer une vente" : undefined} onAction={() => open("sale")}/>}</div></section>
    <section className="panel team-panel"><div className="panel-title"><div><h3>Votre équipe</h3><p>Ensemble, vous allez plus loin.</p></div><span className="count-badge">{c.stats.totalMembers || 0}</span></div><div className="team-list">{c.members.filter(m => m.status === "ACTIVE").slice(0, 3).map((m, i) => <div key={m.id} className="team-person"><Avatar name={m.characterName} index={i}/><div><strong>{m.characterName}</strong><small>{m.role.name}</small></div><span className={`service-state ${online.some(t => t.memberId === m.id) ? "online" : ""}`}>{online.some(t => t.memberId === m.id) ? "En service" : "Hors service"}</span></div>)}</div><div className="service-card"><span className={`service-indicator ${myService ? "online" : ""}`}><Clock3 size={16}/></span><div><strong>{myService ? "Vous êtes en service" : "Prêt à prendre votre service ?"}</strong><small>{myService ? "Votre pointage est en cours." : "Chaque minute compte."}</small></div><button className="icon-btn" aria-label="Ouvrir le pointage" onClick={() => navigate("time")}><ArrowUpRight size={18}/></button></div></section></div>
    {lowStock.length > 0 && allowed("inventory.read") && <button className="stock-alert" onClick={() => navigate("inventory")}><span><Package size={17}/><strong>{lowStock.length} référence{lowStock.length > 1 ? "s" : ""} à réapprovisionner</strong><span>Gardez une longueur d’avance sur votre prochain service.</span></span><span>Voir les stocks<ArrowRight size={15}/></span></button>}
  </>;
}
function Kpi({ label, value, icon: Icon, foot, positive, note }: { label: string; value: string; icon: LucideIcon; foot: string; positive?: boolean; note: string }) { return <div className="panel kpi"><div className="kpi-heading"><span>{label}</span><Icon size={17}/></div><strong className="kpi-value">{value}</strong><div className="kpi-foot"><span className={positive ? "positive" : ""}>{positive && <ArrowUpRight size={12}/>} {foot}</span><small>{note}</small></div></div>; }
function Employees() {
  const { current: c, open, allowed } = useWorkspace(); const [dossier, setDossier] = useState<string | null>(null); if (!c) return null;
  const columns: ColumnDef<Current["members"][number]>[] = [
    { accessorKey: "characterName", header: "Employé", cell: ({ row: { original: m } }) => <span className="person-cell"><Avatar name={m.characterName}/><span><strong>{m.characterName}</strong><small>Depuis le {dt(m.hiredAt)}</small></span></span> },
    { accessorKey: "role.name", header: "Grade" }, { accessorKey: "department", header: "Département" }, { accessorKey: "status", header: "Statut", cell: ({ row }) => <Badge status={row.original.status}/> },
    { id: "action", header: "", cell: ({ row }) => <button className="btn outline small" onClick={() => setDossier(row.original.id)}>Ouvrir la fiche</button> },
  ];
  return <><Heading eyebrow="RESSOURCES HUMAINES" title="Une équipe qui fait la différence." subtitle={`${c.members.filter(m => m.status === "ACTIVE").length} collaborateurs actifs chez ${c.company.name}.`} action={allowed("employees.manage") ? "Inviter un employé" : undefined} onAction={() => open("invite")}/><DataTable data={c.members} columns={columns} placeholder="Rechercher un employé, un grade…"/>{dossier && <EmployeeDossierModal key={`${c.company.id}-${dossier}`} memberId={dossier} close={() => setDossier(null)}/>}{c.pendingInvitations.length > 0 && <section className="panel padded"><h3>Invitations envoyées</h3><div className="invitation-list">{c.pendingInvitations.map(i => <div key={i.id}><span>{i.email}<small>{i.role.name} · Expire le {dt(i.expiresAt)}</small></span><Badge status={i.status}/></div>)}</div></section>}</>;
}
function Sales() {
 const {current:c,open,allowed,navigate}=useWorkspace();if(!c)return null;
 return <><Heading eyebrow="COMMERCE" title="Chaque vente fait avancer votre entreprise." subtitle="L’historique complet de vos transactions RP, avec tickets et remboursements traçables." action={allowed("sales.create")?"Nouvelle vente":undefined} onAction={()=>open("sale")}>{allowed("sales.create")&&c.company.modules.some(m=>m.key==="cash"&&m.enabled)&&<button className="btn outline" onClick={()=>navigate("cash")}>Ouvrir la caisse dédiée</button>}</Heading><SalesHistory key={`${c.company.id}:${c.permissions.join("|")}`} revision={`${c.sales[0]?.id??""}:${c.sales[0]?.status??""}:${c.sales.length}`}/></>;
}

function Inventory() {const {current:c}=useWorkspace();return <InventoryView key={`${c!.company.id}:${c!.permissions.join("|")}`}/>;}

function Finance() { const {current:c}=useWorkspace(); return <FinanceView key={`${c!.company.id}:${c!.permissions.join("|")}`}/>; }

function Roles() { return <RolesView/>; }

function TimeEntries() {const {current:c}=useWorkspace();return c?<TimeView key={`${c.company.id}:${c.permissions.join(",")}`}/>:null;}
function Leaves(){return <LeavesView/>;}

function Audit() { const {current:c}=useWorkspace();return c?<AuditView key={`${c.company.id}:${c.permissions.join(",")}`}/>:null; }
function ModuleCatalog() {
  const { current: c, mutate, busy } = useWorkspace();
  const [search, setSearch] = useState(""); const [category, setCategory] = useState("Tous");
  if (!c) return null;
  const enabled = c.company.modules.filter(m => m.enabled).length;
  return <><Heading eyebrow="PERSONNALISATION" title="Votre entreprise. Vos outils." subtitle="Activez ce qui compte pour vous. Votre espace s’adapte, vos données restent."/><div className="module-hero"><span className="module-hero-icon"><SlidersHorizontal size={29}/></span><div><h2>Un espace qui évolue avec vous.</h2><p>De la gestion d’équipe à votre prochaine vente, composez votre propre cockpit.</p></div><div><strong>{enabled}<span> / {modules.filter(m => m.available).length}</span></strong><small>modules actifs</small></div></div><div className="catalog-toolbar"><div className="segmented">{["Tous", "Ressources humaines", "Commerce", "Finance", "Organisation", "Pilotage"].map(cat => <button key={cat} className={category === cat ? "selected" : ""} onClick={() => setCategory(cat)}>{cat}</button>)}</div><div className="search-input"><Search size={15}/><RPilotInput aria-label="Rechercher un module" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un module…"/></div></div><div className="module-grid">{modules.filter(m => (category === "Tous" || m.category === category) && m.name.toLowerCase().includes(search.toLowerCase())).map(m => { const active = c.company.modules.some(cm => cm.key === m.key && cm.enabled); return <article key={m.key} className={`panel module-card ${!m.available ? "unavailable" : ""}`}><div className="module-card-top"><span className={`module-icon module-${m.category === "Commerce" ? "commerce" : m.category === "Ressources humaines" ? "rh" : "other"}`}>{m.category === "Ressources humaines" ? <Users size={20}/> : m.category === "Commerce" ? <ShoppingBag size={20}/> : <LayoutGrid size={20}/>}</span>{!m.available ? <span className="badge neutral">À venir</span> : m.required ? <span className="badge blue">Essentiel</span> : <button role="switch" aria-checked={active} aria-label={`${active ? "Désactiver" : "Activer"} ${m.name}`} className={`toggle ${active ? "on" : ""}`} disabled={busy} onClick={() => mutate({ action: "module.toggle", key: m.key, enabled: !active }, `${m.name} ${active ? "désactivé" : "activé"}`).catch(() => {})}><span/></button>}</div><h3>{m.name}</h3><p>{m.description}</p><div className="module-card-bottom"><span>{m.category}</span>{m.available && <span className={active ? "positive" : "muted"}><span className={`status-dot ${!active ? "off" : ""}`}/>{active ? "Activé" : "Désactivé"}</span>}</div>{m.dependencies.length > 0 && <small className="dependency-note">Dépend de : {m.dependencies.map(k => modules.find(x => x.key === k)?.name).join(", ")}</small>}</article>; })}</div></>;
}
function Settings() {
  const { current: c, open } = useWorkspace(); if (!c) return null;
  return <><Heading eyebrow="ADMINISTRATION" title="Les détails qui font votre identité." subtitle="Informations, affiliation et règles de votre entreprise." action="Modifier les paramètres" onAction={() => open("settings")}/><div className="panel settings-summary"><EntityLogo name={c.company.name} logoAssetId={c.company.logoAssetId} logoUrl={c.company.logoUrl} className="entity-logo-large"/><div><h2>{c.company.name}</h2><p>{c.company.description || "Ajoutez une description à votre entreprise."}</p><span className="badge neutral">{c.company.sector}</span></div></div><div className="settings-grid"><div className="panel padded"><h3>Règles financières</h3><p>Seuil de validation des dépenses</p><strong className="setting-value">{money(c.company.expenseThreshold)} RP</strong><small className="muted">Les dépenses à partir de ce montant restent en attente de validation.</small></div><div className="panel padded"><h3>Abonnement</h3><p>Formule {c.company.subscription?.plan.name || "Free"}</p><strong className="setting-value">{readLimits(c.company.subscription?.plan.limits).employees} employés</strong><small className="muted">Les slots d’entreprise se gèrent depuis votre compte. Aucun abonnement récurrent n’est ouvert.</small></div></div><div className="info-note"><ShieldCheck size={18}/>Les modules désactivés conservent leurs données. Les permissions sont propres à chaque entreprise.</div></>;
}
function Servers() {
  const { data, open, refresh } = useWorkspace();
  return <><Heading eyebrow="COMMUNAUTÉ" title="Une ville. Des entreprises. Votre communauté." subtitle="Gérez vos espaces serveur RP sans installation FiveM et sans accès à la base de jeu." />{!data.servers.length ? <div className="panel"><Empty icon={Globe2} title="Votre communauté commence ici." description="Les serveurs sont créés par l’administration Nyro Dashboard. Vos accès apparaîtront après attribution par un administrateur."/></div> : <div className="server-grid">{data.servers.map(s => <section className="panel server-card" key={s.id}><div className="server-heading"><EntityLogo name={s.name} logoAssetId={s.logoAssetId} logoUrl={s.logoUrl}/><span className="badge green">Espace actif</span></div><h2>{s.name}</h2><p>{s.description || "Votre communauté RP, réunie dans un même espace."}</p><div className="mini-label">{s.companies.length} ENTREPRISE(S) AFFILIÉE(S)</div><div className="server-companies">{s.companies.map(c => <div key={c.id}><span className="company-logo"><Building2 size={18}/></span><span><strong>{c.name}</strong><small>{c.sector}</small></span>{data.companies.some(m => m.id === c.id) ? <button className="icon-btn" aria-label={`Ouvrir ${c.name}`} onClick={() => refresh(c.id).catch(() => {})}><ArrowUpRight size={17}/></button> : <ShieldCheck size={16}/>}</div>)}{!s.companies.length && <small className="muted">Aucune entreprise affiliée pour le moment.</small>}</div>{s.auditLogs.length > 0 && <div className="server-history"><div className="mini-label">ACTIVITÉ DU SERVEUR</div>{s.auditLogs.slice(0, 5).map(a => <div key={a.id}><span><strong>{a.action}</strong><small>{a.actorName}</small></span><small>{dt(a.createdAt)}</small></div>)}</div>}{s.permissions.includes("companies.manage") && <button className="btn outline" onClick={() => open("company", { serverId: s.id })}><Plus size={15}/>Créer une entreprise affiliée</button>}</section>)}</div>}</>;
}

function Companies() {
  const { data, current, refresh, open } = useWorkspace();
  return <><Heading eyebrow="VOTRE ESPACE PERSONNEL" title="Vos entreprises." subtitle="Choisissez une équipe. Chaque entreprise conserve ses données, son identité et ses permissions." action="Créer une entreprise" onAction={() => open("company")}/><p className="finance-note">{data.companySlots.owned}/{data.companySlots.total} entreprises possédées · {data.companySlots.remaining} slot(s) disponible(s). <a className="text-link" href="/compte/slots">Gérer mes slots</a></p><div className="company-choice-grid">{data.companies.map(c=><CompanyCard key={c.id} company={c} serverName={data.servers.find(s=>s.id===c.serverId)?.name} current={current?.company.id===c.id} onOpen={()=>{void refresh(c.id).catch(()=>{});}}/>)}</div>{!data.companies.length&&<Empty title="Votre premier espace vous attend." description="Créez votre entreprise ou utilisez le lien d’invitation de votre responsable." action="Créer une entreprise" onAction={()=>open("company")}/>}</>;
}

function Subscription() {
  const { current: c, data } = useWorkspace();
  const limits = readLimits(c?.company.subscription?.plan.limits);
  return <><Heading eyebrow="VOTRE FORMULE" title="Un espace pour vos ambitions." subtitle="Consultez les capacités de votre formule actuelle."/><div className="subscription-layout"><section className="panel padded"><span className="badge neutral">FORMULE ACTUELLE</span><h2 className="subscription-name">{c?.company.subscription?.plan.name || "Free"}</h2><p>Les fonctionnalités disponibles sont accessibles selon vos permissions et les modules activés.</p><div className="quota-list">{[["Employés dans cette entreprise", c?.stats.totalMembers ?? "Accès restreint", limits.employees], ["Entreprises accessibles à votre compte", data.companies.length, "Selon votre formule"], ["Entreprises possédées sur votre compte Discord", data.companySlots.owned, data.companySlots.total], ["Serveurs RP accessibles", data.servers.length, "Selon vos accès"]].map(([label, value, limit]) => <div key={String(label)}><span>{label}</span><strong>{value}<small> / {limit}</small></strong></div>)}</div></section><section className="panel padded"><CreditCard size={25}/><h2 className="subscription-name">Vos slots d’entreprise</h2><p>Une entreprise incluse par compte Discord, tous espaces confondus. Des slots supplémentaires peuvent être attribués par l’administration ou achetés à 5 € en achat unique lorsque le paiement est ouvert.</p><a className="btn primary" href="/compte/slots">Gérer mes slots</a></section></div></>;
}



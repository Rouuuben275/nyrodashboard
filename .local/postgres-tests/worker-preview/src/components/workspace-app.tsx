"use client";
import {useTheme} from "./theme-provider";
import {ThemeSelector} from "./theme-selector";
import {EntityLogo} from "./entity-logo";
import { RPilotTooltip } from "./ui/primitives";
import { useCallback, useEffect, useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, Boxes, Building2, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3, Command, CreditCard, FileClock, Globe2, LayoutDashboard, LogOut, Menu, Moon, Package, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Sun, Users, Wallet, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import type { WorkspaceData } from "@/domains/core/queries";
import { modules } from "@/domains/modules/registry";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/utils";
import { WorkspaceContext, type View, type FormKind } from "./workspace-context";
import { WorkspaceViews } from "./workspace-views";
import { WorkspaceForms } from "./workspace-forms";
import { Brand } from "./brand";
import { RPilotCommandPalette } from "./ui/command-palette";
import { Modal } from "./ui/dialog";

export const viewLabels: Record<View, string> = { statistics:"Statistiques avancées", equipment:"Véhicules et équipements", messages: "Messagerie interne", cash: "Caisse dédiée", notifications: "Notifications", documents: "Documents", calendar: "Calendrier", announcements: "Annonces internes", reviews: "Évaluations", sanctions: "Sanctions internes", payroll: "Salaires et primes", recruitment: "Recrutement", dashboard: "Vue d’ensemble", employees: "Employés", roles: "Grades et permissions", planning: "Planning", time: "Pointage", leaves: "Absences et congés", sales: "Ventes", finance: "Comptabilité", expenses: "Dépenses", products: "Produits et prestations", inventory: "Stocks", tasks: "Tâches", modules: "Modules", audit: "Historique et audit", settings: "Paramètres", servers: "Mes serveurs RP", companies: "Mes entreprises", subscription: "Abonnement", crm: "Clients et CRM", quotes: "Devis", invoices: "Factures", suppliers: "Fournisseurs", orders: "Commandes d’achat" };
const nav: { label: string; items: [View, LucideIcon][] }[] = [
  { label: "ESPACE DE TRAVAIL", items: [["dashboard", LayoutDashboard], ["statistics", ChartNoAxesCombined], ["equipment", Boxes], ["messages", Users], ["documents", FileClock], ["tasks", ClipboardList], ["announcements", Bell], ["calendar", CalendarDays], ["notifications", Bell]] },
  { label: "RESSOURCES HUMAINES", items: [["reviews", ClipboardList], ["sanctions", ShieldCheck], ["payroll", Wallet], ["recruitment", ClipboardList], ["employees", Users], ["planning", CalendarDays], ["time", Clock3], ["leaves", CalendarDays], ["roles", ShieldCheck]] },
  { label: "COMMERCE & FINANCES", items: [["cash", ShoppingBag], ["sales", ShoppingBag], ["finance", ChartNoAxesCombined], ["expenses", Wallet], ["products", Package], ["inventory", Boxes], ["crm", Users], ["quotes", ClipboardList], ["invoices", CreditCard], ["suppliers", Building2], ["orders", ClipboardList]] },
  { label: "ADMINISTRATION", items: [["modules", SlidersHorizontal], ["audit", FileClock], ["settings", Settings2]] },
];
export function WorkspaceApp({ initial, user, inviteToken,createCompany=false }: { initial: WorkspaceData; user: { id: string; name: string; email: string }; inviteToken?: string;createCompany?:boolean }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>("dashboard");
  const [form, setForm] = useState<{ kind: FormKind; record?: Record<string, unknown> } | null>(inviteToken ? { kind: "accept", record: { token: inviteToken } } : createCompany?{kind:"company"}:null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const {resolved}=useTheme();const light=resolved==="light";
  const [iconMode, setIconMode] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const current = data.current;
  const companyId = current?.company.id;
  const allowed = useCallback((p: string) => { const definition = modules.find(m => m.key === p.split(".")[0]); return Boolean(current?.permissions.includes(p) && (!definition || current.company.modules.some(m => m.key === definition.key && m.enabled))); }, [current]);
  const visible = (v: View) => {
    if (v === "notifications") return true;
    if (v === "modules") return allowed("modules.manage");
    if (v === "settings") return allowed("company.manage");
    if (["servers", "companies", "subscription"].includes(v)) return true;
    const m = modules.find(m => m.key === v);
    return Boolean(m && allowed(m.permission) && current?.company.modules.some(cm => cm.key === v && cm.enabled));
  };
  const refresh = useCallback(async (id?: string) => {
    setRefreshing(true);
    try {
      const query=new URLSearchParams();if(id||companyId)query.set("companyId",id||companyId!);if(data.space)query.set("space",data.space);
      const response = await fetch(`/api/workspace${query.size?`?${query}`:""}`, { cache: "no-store" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error);
      setData(next);
      if (id) { window.history.replaceState(null, "", `/app?company=${encodeURIComponent(id)}${data.space ? `&space=${encodeURIComponent(data.space)}` : ""}`); setView("dashboard"); }
    } finally { setRefreshing(false); }
  }, [companyId,data.space]);
  async function mutate(payload: Record<string, unknown>, message = "Modification enregistrée") {
    setBusy(true);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (payload.action === "company.create" || payload.action === "invite.accept") await refresh(result.data.id);
      else await refresh();
      toast.success(message);
      return result.data as Record<string, unknown>;
    } catch (error) { toast.error(error instanceof Error ? error.message : "L’opération a échoué."); throw error; }
    finally { setBusy(false); }
  }
  const open = (kind: FormKind, record?: Record<string, unknown>) => {if(kind === "server"){window.location.assign("/admin/servers");return;}const server=data.servers.find(s=>s.id===data.space&&s.permissions.includes("companies.manage"));setForm({ kind, record:kind==="company"&&server?{serverId:server.id,...record}:record });};
  const navigate = (next: View) => { setView(next); const url=new URL(window.location.href);url.searchParams.set("view",next);window.history.replaceState(null,"",url.pathname+url.search); setMobile(false); setSearch(null); };
  useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("view");if(requested&&Object.hasOwn(viewLabels,requested))setView(requested as View);},[companyId]);
  useEffect(() => { try{setIconMode(localStorage.getItem("rpilot:sidebar") === "icons");}catch{setIconMode(false);} }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearch(s => s === null ? "" : null); } };
    window.addEventListener("keydown", listener);
    const timer = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 60000);
    return () => { window.removeEventListener("keydown", listener); clearInterval(timer); };
  }, [refresh]);
  const quickActions = ([
    { kind: "sale", label: "Nouvelle vente", module: "sales", permission: "sales.create", icon: ShoppingBag },
    { kind: "product", label: "Produit ou prestation", module: "products", permission: "products.manage", icon: Package },
    { kind: "invite", label: "Inviter un employé", module: "employees", permission: "employees.manage", icon: Users },
    { kind: "shift", label: "Planifier un service", module: "planning", permission: "planning.manage", icon: CalendarDays },
    { kind: "expense", label: "Nouvelle dépense", module: "expenses", permission: "expenses.create", icon: Wallet },
    { kind: "task", label: "Nouvelle tâche", module: "tasks", permission: "tasks.manage", icon: ClipboardList },
  ] satisfies { kind: FormKind; label: string; module: string; permission: string; icon: LucideIcon }[]).filter(a => allowed(a.permission) && current?.company.modules.some(m => m.key === a.module && m.enabled));
  const unread = data.notificationUnread;
  const swallow = (promise: Promise<unknown>) => { promise.catch(() => {}); };
  return <WorkspaceContext.Provider value={{ data, current, user, view, navigate, open, mutate, busy, allowed, refresh }}><div className={`workspace ${light ? "light" : ""} ${iconMode ? "sidebar-icons" : ""}`}>
    {mobile && <button className="sidebar-scrim" onClick={() => setMobile(false)} aria-label="Fermer le menu"/>}
    <aside className={`sidebar ${mobile ? "is-open" : ""}`}><div className="sidebar-brand-row"><Brand href="/app"/><button className="icon-btn sidebar-collapse" aria-label={iconMode ? "Développer la navigation" : "Réduire la navigation"} onClick={() => { setIconMode(!iconMode); try{localStorage.setItem("rpilot:sidebar", !iconMode ? "icons" : "full");}catch{} }}>{iconMode ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}</button></div>
      <Dropdown.Root><Dropdown.Trigger className="company-switch" aria-label="Changer d’entreprise" disabled={busy}><EntityLogo name={current?.company.name??"Votre entreprise"} logoAssetId={current?.company.logoAssetId} logoUrl={current?.company.logoUrl} className="company-switch-logo"/><span><strong>{current?.company.name || "Votre entreprise"}</strong><small>{current?.company.sector || "Créez votre espace"}</small></span><ChevronDown size={15}/></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown company-dropdown" sideOffset={8} align="start">{data.companies.map(c => <Dropdown.Item key={c.id} onSelect={() => swallow(refresh(c.id))}><EntityLogo name={c.name} logoAssetId={c.logoAssetId} logoUrl={c.logoUrl} className="entity-logo-small"/>{c.name}{c.id === companyId && <Check size={14}/>}</Dropdown.Item>)}<Dropdown.Separator/><Dropdown.Item onSelect={() => navigate("companies")}><Building2 size={15}/>Toutes mes entreprises</Dropdown.Item><Dropdown.Item onSelect={() => open("company")}><Plus size={15}/>Créer une entreprise</Dropdown.Item></Dropdown.Content></Dropdown.Portal></Dropdown.Root>
      <nav className="sidebar-nav">{nav.filter(group => group.items.some(([v]) => visible(v))).map(group => <section className="nav-group" key={group.label}><button className="nav-category" onClick={() => setCollapsed(v => v.includes(group.label) ? v.filter(x => x !== group.label) : [...v, group.label])}>{group.label}<ChevronDown size={12} className={collapsed.includes(group.label) ? "rotated" : ""}/></button>{(!collapsed.includes(group.label) || (iconMode && !mobile)) && group.items.filter(([v]) => visible(v)).map(([v, Icon]) => <RPilotTooltip key={v} content={viewLabels[v]}><button  aria-label={viewLabels[v]} aria-current={view === v ? "page" : undefined} className={`nav-item ${view === v ? "active" : ""}`} onClick={() => navigate(v)}><Icon size={17}/><span>{viewLabels[v]}</span>{v === "tasks" && current?.openTaskCount ? <span className="nav-count">{current.openTaskCount}</span> : null}</button></RPilotTooltip>)}</section>)}</nav>
      <div className="sidebar-bottom"><RPilotTooltip content="Mes serveurs RP"><button className={`nav-item ${view === "servers" ? "active" : ""}`} aria-label="Mes serveurs RP" onClick={() => navigate("servers")}><Globe2 size={17}/><span>Mes serveurs RP</span><ArrowUpRight size={14}/></button></RPilotTooltip><RPilotTooltip content="Centre d’aide"><button className="nav-item" aria-label="Centre d’aide" onClick={() => setHelp(true)}><CircleHelp size={17}/><span>Aide et ressources</span></button></RPilotTooltip><RPilotTooltip content="Abonnement"><button className="nav-item" aria-label="Abonnement" onClick={() => navigate("subscription")}><CreditCard size={17}/><span>Abonnement</span><small>{current?.company.subscription?.plan.name || "Free"}</small></button></RPilotTooltip><button aria-label="Ouvrir mon profil" className="user-button" onClick={() => open("profile")}><span className="avatar user-avatar">{initials(user.name)}</span><span><strong>{user.name}</strong><small>Mon compte personnel</small></span><Settings2 size={15}/></button></div>
    </aside>
    <div className="main-wrap"><header className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-menu" aria-label="Ouvrir le menu" onClick={() => setMobile(true)}><Menu size={20}/></button><Building2 size={15}/><span>{current?.company.name || "Mon espace"}</span><ChevronRight size={13}/><strong>{viewLabels[view]}</strong></div><div className="topbar-actions"><Dropdown.Root><Dropdown.Trigger className="btn primary quick-create" aria-label="Création rapide"><Plus size={15}/><span>Créer</span><ChevronDown size={12}/></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown" align="end" sideOffset={10}><Dropdown.Label>CRÉATION RAPIDE</Dropdown.Label>{quickActions.map(a => <Dropdown.Item key={a.kind} onSelect={() => open(a.kind)}><a.icon size={15}/>{a.label}</Dropdown.Item>)}<Dropdown.Separator/><Dropdown.Item onSelect={() => open("company")}><Building2 size={15}/>Nouvelle entreprise</Dropdown.Item>{data.platformAdmin && <Dropdown.Item onSelect={() => window.location.assign("/admin/servers")}><Globe2 size={15}/>Administration des serveurs</Dropdown.Item>}</Dropdown.Content></Dropdown.Portal></Dropdown.Root><button className="global-search" aria-label="Rechercher dans votre espace" onClick={() => setSearch("")}><Search size={15}/><span>Rechercher…</span><kbd>⌘ K</kbd></button><Dropdown.Root><Dropdown.Trigger className="server-switch"><span className="status-dot"/>{data.servers.find(s => s.id === current?.company.serverId)?.name || "Indépendant"}<ChevronDown size={13}/></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown" align="end" sideOffset={8}>{data.servers.map(s => <Dropdown.Item key={s.id} onSelect={() => window.location.assign(`/app?space=${encodeURIComponent(s.id)}`)}><Globe2 size={15}/>{s.name}</Dropdown.Item>)}<Dropdown.Item onSelect={() => window.location.assign("/app?space=independent")}>Mes entreprises indépendantes</Dropdown.Item><Dropdown.Item onSelect={() => window.location.assign("/espaces")}>Choisir un espace RP</Dropdown.Item>{data.platformAdmin && <Dropdown.Item onSelect={() => window.location.assign("/admin")}>Administration globale</Dropdown.Item>}</Dropdown.Content></Dropdown.Portal></Dropdown.Root><span className="header-divider"/><ThemeSelector/><button className="icon-btn notification-button" aria-label={`Notifications, ${unread} non lues`} onClick={() => setNotifications(!notifications)}><Bell size={18}/>{unread > 0 && <span className="notification-dot"/>}</button><Dropdown.Root><Dropdown.Trigger className="avatar small-avatar" aria-label="Menu du profil">{initials(user.name)}</Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown" align="end" sideOffset={12}><Dropdown.Label>{user.name}</Dropdown.Label><Dropdown.Item onSelect={() => open("profile")}><Users size={15}/>Mon profil</Dropdown.Item><Dropdown.Item onSelect={() => window.location.assign("/compte/slots")}><Building2 size={15}/>Mes slots d’entreprise</Dropdown.Item><Dropdown.Item onSelect={() => window.location.assign("/espaces")}>Changer d’espace RP</Dropdown.Item>{data.platformAdmin && <Dropdown.Item onSelect={() => window.location.assign("/admin")}>Administration globale</Dropdown.Item>}<Dropdown.Item onSelect={() => window.location.assign("/candidatures")}><ClipboardList size={15}/>Mes candidatures</Dropdown.Item><Dropdown.Separator/><Dropdown.Item onSelect={() => swallow(authClient.signOut().then(() => { window.location.assign("/login"); }))}><LogOut size={15}/>Se déconnecter</Dropdown.Item></Dropdown.Content></Dropdown.Portal></Dropdown.Root></div></header>
      {refreshing && <div className="refresh-line"/>}
      <main className="main-content" id="workspace-content">{user.email === "demo@Nyro Dashboard.local" && <div className="demo-banner"><Sparkles size={12}/><span>Espace de démonstration · Données fictives</span><button onClick={() => open("company")}>Créer mon entreprise<ArrowUpRight size={12}/></button></div>}<WorkspaceViews/></main><footer className="app-footer"><span><span className="status-dot"/> Votre espace de gestion indépendant</span><span>Fait pour votre roleplay <span className="footer-dot">·</span> Nyro Dashboard · Workspace</span></footer>
    </div>
    {notifications && <div className="notification-panel panel"><div className="panel-title"><h3>Notifications <span className="count-badge">{unread}</span></h3><button className="icon-btn" aria-label="Fermer les notifications" onClick={() => setNotifications(false)}><X size={17}/></button></div><button className="btn outline small" onClick={()=>{setNotifications(false);navigate("notifications");}}>Ouvrir le centre de notifications</button>{data.notifications.length ? data.notifications.map(n => <button className={`notification-row ${n.readAt ? "read" : ""}`} key={n.id} onClick={() => swallow(mutate({ action: "notification.read", notificationId: n.id }, "Notification marquée comme lue"))}><span className="activity-icon"><Bell size={15}/></span><span><strong>{n.title}</strong><p>{n.body}</p><small>{new Date(n.createdAt).toLocaleDateString("fr-FR")}</small></span>{!n.readAt && <span className="status-dot blue"/>}</button>) : <div className="empty compact"><Bell size={28}/><p>Vous êtes à jour.</p></div>}</div>}
    <WorkspaceForms form={form} close={() => setForm(null)}/>
    <RPilotCommandPalette open={search !== null} onOpenChange={v => setSearch(v ? "" : null)} items={[
      ...(Object.entries(viewLabels) as [View, string][]).filter(([key]) => visible(key)).map(([key, label]) => ({id: `view-${key}`, label, group: "Navigation", onSelect: () => navigate(key)})),
      ...(current?.members || []).map(m => ({id: `member-${m.id}`, label: m.characterName, group: "Employés", onSelect: () => navigate("employees")})),
      ...(current?.products || []).filter(p => !p.archived).map(p => ({id: `product-${p.id}`, label: p.name, group: "Catalogue", onSelect: () => navigate("products")})),
    ]}/>

    <Modal open={help} onOpenChange={setHelp} title="Bienvenue à bord." description="Tout ce qu’il faut pour prendre les commandes."><div className="help-content"><p>Créez une entreprise, invitez votre équipe puis configurez les accès dans <strong>Grades et permissions</strong>. Les modules s’activent depuis le catalogue.</p><p>Enregistrez vos produits puis ouvrez la caisse : chaque vente met à jour vos stocks et votre journal financier RP. Les annulations restent tracées.</p><p>Le solde affiché appartient à cet espace RP. Il est indépendant du compte bancaire de votre personnage en jeu.</p><div className="info-note"><ShieldCheck size={18}/>Les modules marqués « À venir » ne sont pas disponibles dans cette version.</div></div></Modal>
  </div></WorkspaceContext.Provider>;
}



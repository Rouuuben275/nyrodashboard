"use client";
import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { modules, permissionLabels, defaultEmployeePermissions } from "@/domains/modules/registry";
import { RPilotCheckbox } from "./ui/primitives";
import { RPilotSelect } from "./ui/select";
const names: Record<string, string> = { company: "Entreprise", modules: "Configuration des modules" };
export function PermissionEditor({ value, onChange, permitted, enabled, readOnly }: { value: string[]; onChange?: (values: string[]) => void; permitted: string[]; enabled: string[]; readOnly?: boolean }) {
  const [filter, setFilter] = useState("all");
  const groups = [...new Set(Object.keys(permissionLabels).map(p => p.split(".")[0]))];
  const toggle = (key: string, checked: boolean) => onChange?.(checked ? [...new Set([...value, key])] : value.filter(p => p !== key));
  return <div className="permission-editor"><div className="permission-editor-toolbar"><strong>{value.length} accès {readOnly ? "attribués" : "sélectionnés"}</strong><RPilotSelect aria-label="Filtrer les permissions" value={filter} onValueChange={setFilter} options={[{value:"all",label:"Tous les modules"},{value:"selected",label:"Accès accordés"},{value:"enabled",label:"Modules activés"}]}/></div>{!readOnly && <div className="permission-templates"><span>Point de départ :</span><button type="button" className="btn outline small" onClick={() => onChange?.([])}>Aucun accès</button><button type="button" className="btn outline small" onClick={() => onChange?.(defaultEmployeePermissions.filter(p => permitted.includes(p)))}>Employé</button><button type="button" className="btn outline small" onClick={() => onChange?.(Object.keys(permissionLabels).filter(p => p.endsWith(".read") && permitted.includes(p)))}>Consultation</button></div>}<p className="muted">Un accès s’applique lorsque le module correspondant est actif. L’ordre des grades ne confère aucun droit supplémentaire.</p><div className="permission-matrix">{groups.filter(g => filter !== "enabled" || enabled.includes(g) || !modules.some(m => m.key === g)).map(group => {
    const keys = Object.keys(permissionLabels).filter(p => p.startsWith(`${group}.`) && (filter !== "selected" || value.includes(p)));
    if (!keys.length) return null;
    const definition = modules.find(m => m.key === group);
    const active = !definition || enabled.includes(group);
    return <section key={group}><div><h3>{definition?.name || names[group] || group}</h3><span className="badge neutral">{active ? "Actif" : "Module désactivé"}</span></div><div>{keys.map(key => <label key={key} className="permission-action">{readOnly ? value.includes(key) ? <Check size={15}/> : <Minus size={15}/> : <RPilotCheckbox checked={value.includes(key)} disabled={!permitted.includes(key)} onCheckedChange={v => toggle(key, v === true)} aria-label={permissionLabels[key]}/>}<span><strong>{permissionLabels[key]}</strong><small>{readOnly && value.includes(key) && !active ? "Accordé, suspendu tant que le module est désactivé" : key.endsWith(".read") ? "Consultation" : key.endsWith(".approve") ? "Validation" : key.endsWith(".manage") ? "Gestion et modification" : key.endsWith(".create") ? "Création" : key.endsWith(".cancel") ? "Annulation" : "Utilisation"}</small></span></label>)}</div></section>;
  })}</div></div>;
}

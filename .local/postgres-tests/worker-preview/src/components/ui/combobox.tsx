"use client";
import { useEffect, useId, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
export type Choice = { value: string; label: string; disabled?: boolean };
type Props = { options: Choice[]; value: string; onValueChange: (value: string) => void; name?: string; id?: string; placeholder?: string; disabled?: boolean; loading?: boolean; required?: boolean; error?: string; className?: string; "aria-label"?: string; "aria-labelledby"?: string; loadOptions?: (query: string, signal: AbortSignal) => Promise<Choice[]>; allowCustom?: boolean };
export function RPilotCombobox({ options, value, onValueChange, name, id, placeholder = "Rechercher et sélectionner…", disabled, loading, required, error, className = "", loadOptions, allowCustom, ...aria }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Choice[]>([]);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [limit, setLimit] = useState(80);
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  useEffect(() => {
    if (!open || !loadOptions) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { setPending(true); setLoadError(""); loadOptions(query, controller.signal).then(rows => { if (!controller.signal.aborted) setRemote(rows); }).catch(() => { if (!controller.signal.aborted) setLoadError("Chargement impossible. Réessayez."); }).finally(() => { if (!controller.signal.aborted) setPending(false); }); }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, loadOptions]);
  const filtered = loadOptions ? remote : options.filter(o => `${o.label} ${o.value}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
  const chosen = filtered.find(o => o.value === value);
  const list = !query && chosen ? [chosen, ...filtered.filter(o => o.value !== value)] : filtered;
  const select = (v: string) => { onValueChange(v); setInvalid(false); setOpen(false); setQuery(""); };
  return <div className={`rp-control ${className}`}><input type="hidden" name={disabled ? undefined : name} value={value}/><Popover.Root open={open} onOpenChange={v => { setOpen(v); if (!v) setQuery(""); }}><Popover.Trigger id={id} className="rp-select" disabled={disabled || loading} aria-label={aria["aria-label"]} aria-labelledby={aria["aria-labelledby"]} aria-invalid={!!(error || invalid)} aria-describedby={error ? errorId : undefined}><span>{options.find(o => o.value === value)?.label || remote.find(o => o.value === value)?.label || value || placeholder}</span>{loading ? <Loader2 size={15} className="spin"/> : <ChevronDown size={15}/>}</Popover.Trigger><Popover.Portal><Popover.Content className="rp-popover rp-combo" sideOffset={6} collisionPadding={12} align="start"><Command label={aria["aria-label"] || "Choisir une valeur"} shouldFilter={false}><div className="rp-command-search"><Search size={15}/><Command.Input value={query} onValueChange={v => { setQuery(v); setLimit(80); }} placeholder="Rechercher…"/></div><Command.List>{(pending || loading) && <div role="status" className="rp-empty">Chargement…</div>}{loadError && <div role="alert" className="rp-error">{loadError}</div>}<Command.Empty>Aucun résultat.</Command.Empty>{!required && !query && <Command.Item value="effacer la sélection" onSelect={() => select("")}><X size={14}/>Aucune sélection</Command.Item>}{list.slice(0, limit).map(o => <Command.Item key={o.value} value={`${o.label} ${o.value}`} disabled={o.disabled} onSelect={() => select(o.value)}>{o.label}{o.value === value && <Check size={14}/>}</Command.Item>)}{list.length > limit && <button className="rp-multi-all" type="button" onClick={() => setLimit(n => n + 80)}>Afficher les résultats suivants ({list.length - limit})</button>}{allowCustom && query.trim() && !list.some(o => o.label.toLowerCase() === query.trim().toLowerCase()) && <Command.Item value={`Créer ${query}`} onSelect={() => select(query.trim())}>Utiliser « {query.trim()} »</Command.Item>}</Command.List></Command></Popover.Content></Popover.Portal></Popover.Root>{required && <input className="rp-validation" tabIndex={-1} aria-hidden="true" required onChange={() => {}} value={value} onInvalid={e => { e.preventDefault(); setInvalid(true); e.currentTarget.parentElement?.querySelector('button')?.focus(); }}/ >}{(error || invalid) && <small id={errorId} role="alert" className="rp-error">{error || "Choisissez une valeur."}</small>}</div>;
}
export function RPilotMultiSelect({ options, value, onValueChange, name, label, disabled, loading }: { options: Choice[]; value: string[]; onValueChange: (value: string[]) => void; name?: string; label: string; disabled?: boolean; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onValueChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const enabled = options.filter(o => !o.disabled);
  const all = enabled.length > 0 && enabled.every(o => value.includes(o.value));
  return <div className="rp-control">{value.map(v => <input type="hidden" name={disabled ? undefined : name} key={v} value={v}/>)}<Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger className="rp-select" aria-label={label} disabled={disabled || loading}>{label} · {value.length}<ChevronDown size={15}/></Popover.Trigger><Popover.Portal><Popover.Content className="rp-popover rp-combo" align="start" sideOffset={6} collisionPadding={12}><Command label={label}><div className="rp-command-search"><Search size={15}/><Command.Input placeholder="Rechercher…"/></div><button type="button" className="rp-multi-all" onClick={() => onValueChange(all ? value.filter(v => !enabled.some(o => o.value === v)) : [...new Set([...value, ...enabled.map(o => o.value)])])}>{all ? "Tout désélectionner" : "Tout sélectionner"}</button><Command.List><Command.Empty>Aucun résultat.</Command.Empty>{options.map(o => <Command.Item key={o.value} value={`${o.label} ${o.value}`} disabled={o.disabled} onSelect={() => toggle(o.value)}><span className={`rp-check-display ${value.includes(o.value) ? "checked" : ""}`}>{value.includes(o.value) && <Check size={12}/>}</span>{o.label}<span className="sr-only">{value.includes(o.value) ? "Sélectionné" : "Non sélectionné"}</span></Command.Item>)}</Command.List></Command></Popover.Content></Popover.Portal></Popover.Root><div className="rp-tags">{value.map(v => <span key={v}>{options.find(o => o.value === v)?.label || v}<button disabled={disabled} type="button" aria-label={`Retirer ${options.find(o => o.value === v)?.label || v}`} onClick={() => toggle(v)}><X size={12}/></button></span>)}</div></div>;
}

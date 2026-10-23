"use client";
import { Children, Fragment, isValidElement, useId, useState, type ReactNode } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { RPilotCombobox, RPilotMultiSelect, type Choice } from "./combobox";

function text(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join("");
}
function choices(children: ReactNode): Choice[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return [];
    if (child.type === Fragment) return choices(child.props.children);
    return [{ value: String(child.props.value ?? text(child.props.children)), label: text(child.props.children), disabled: child.props.disabled }];
  });
}
type Props = { children?: ReactNode; options?: Choice[]; value?: string; defaultValue?: string; onValueChange?: (value: string) => void; name?: string; id?: string; required?: boolean; disabled?: boolean; loading?: boolean; error?: string; placeholder?: string; className?: string; searchable?: boolean; "aria-label"?: string; "aria-labelledby"?: string };
export function RPilotSelect({ children, options, value, defaultValue, onValueChange, name, id, required, disabled, loading, error, placeholder = "Sélectionner…", className = "", searchable, ...aria }: Props) {
  const list = options ?? choices(children);
  const [local, setLocal] = useState(() => defaultValue ?? list.find(o => !o.disabled)?.value ?? "");
  const selected = value ?? local;
  const errorId = useId();
  const [invalid, setInvalid] = useState(false);
  const change = (v: string) => { setLocal(v); setInvalid(false); onValueChange?.(v); };
  if (searchable || list.length > 12) return <RPilotCombobox {...{ options: list, value: selected, onValueChange: change, name, id, required, disabled: disabled || loading, loading, error, placeholder, className, ...aria }}/>;
  // Radix reserves the empty string for clearing. Encode it only inside the primitive;
  // the separate form control keeps the original domain value (including empty filters).
  const encoded = (v: string) => v === "" ? "__rpilot_empty_option__" : v;
  return <div className={`rp-control ${className}`}><input type="hidden" name={disabled ? undefined : name} value={selected}/><Select.Root value={encoded(selected)} onValueChange={v => change(v === "__rpilot_empty_option__" ? "" : v)} disabled={disabled || loading} required={required}>
    <Select.Trigger id={id} className="rp-select" aria-label={aria["aria-label"]} aria-labelledby={aria["aria-labelledby"]} aria-invalid={!!(error || invalid)} aria-describedby={error ? errorId : undefined}><Select.Value placeholder={placeholder}/><Select.Icon>{loading ? <Loader2 size={15} className="spin"/> : <ChevronDown size={15}/>}</Select.Icon></Select.Trigger>
    <Select.Portal><Select.Content className="rp-popover rp-select-menu" position="popper" sideOffset={6} collisionPadding={12}><Select.ScrollUpButton className="rp-scroll-button"><ChevronUp size={14}/></Select.ScrollUpButton><Select.Viewport>{list.map(o => <Select.Item className="rp-option" key={o.value} value={encoded(o.value)} disabled={o.disabled}><Select.ItemText>{o.label}</Select.ItemText><Select.ItemIndicator><Check size={14}/></Select.ItemIndicator></Select.Item>)}</Select.Viewport><Select.ScrollDownButton className="rp-scroll-button"><ChevronDown size={14}/></Select.ScrollDownButton></Select.Content></Select.Portal>
  </Select.Root>{required && <input className="rp-validation" tabIndex={-1} aria-hidden="true" value={selected} required onChange={() => {}} onInvalid={e => { e.preventDefault(); setInvalid(true); e.currentTarget.parentElement?.querySelector('button')?.focus(); }}/ >}{(error || invalid) && <small id={errorId} role="alert" className="rp-error">{error || "Choisissez une valeur."}</small>}</div>;
}
export { RPilotMultiSelect };

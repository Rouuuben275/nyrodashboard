"use client";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker, useDayPicker, type DateRange, type Matcher } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { CalendarDays, Clock3, X } from "lucide-react";
import { dateValue, parseLocalDate, timeOptions } from "@/lib/calendar";
import { RPilotSelect } from "./select";

function CalendarCaption() {
  const { months, goToMonth } = useDayPicker();
  const date = months[0].date;
  return <div className="rp-calendar-caption"><RPilotSelect required aria-label="Mois" value={String(date.getMonth())} onValueChange={v => goToMonth(new Date(date.getFullYear(), Number(v), 1))} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i), label: new Date(2024, i, 1).toLocaleDateString("fr-FR", { month: "long" }) }))}/><RPilotSelect required aria-label="Année" value={String(date.getFullYear())} onValueChange={v => goToMonth(new Date(Number(v), date.getMonth(), 1))} options={Array.from({ length: 201 }, (_, i) => ({ value: String(1900 + i), label: String(1900 + i) }))}/></div>;
}
const calendarComponents = { MonthCaption: CalendarCaption };
type Props = { value?: string; defaultValue?: string; onValueChange?: (value: string) => void; name?: string; id?: string; required?: boolean; disabled?: boolean; min?: string; max?: string; unavailable?: Matcher | Matcher[]; label?: string; kind?: "date" | "datetime-local" | "time"; minuteStep?: number };
export function RPilotDateTimePicker({ value, defaultValue = "", onValueChange, name, id, required, disabled, min, max, unavailable, label, kind = "datetime-local", minuteStep = 5 }: Props) {
  const [local, setLocal] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const current = value ?? local;
  const day = parseLocalDate(current.slice(0, 10));
  const time = kind === "time" ? current : current.slice(11, 16);
  const dateText = day?.toLocaleDateString("fr-FR") || "";
  const display = kind === "time" ? time : kind === "date" ? dateText : `${dateText}${dateText && time ? ` à ${time}` : ""}`;
  const change = (v: string) => { setLocal(v); setInvalid(false); onValueChange?.(v); };
  const restrictions: Matcher[] = [...(Array.isArray(unavailable) ? unavailable : unavailable ? [unavailable] : [])];
  if (min && parseLocalDate(min.slice(0, 10))) restrictions.push({ before: parseLocalDate(min.slice(0, 10))! });
  if (max && parseLocalDate(max.slice(0, 10))) restrictions.push({ after: parseLocalDate(max.slice(0, 10))! });
  const updateTime = (next: string) => change(kind === "time" ? next : `${dateValue(day || new Date())}T${next}`);
  const valid = current && (kind === "time" ? /^\d{2}:\d{2}$/.test(current) : !!day && (kind !== "datetime-local" || /^\d{2}:\d{2}$/.test(time))) && (!min || current >= min) && (!max || current <= max);
  const times = timeOptions(minuteStep, kind === "time" ? min : day && min?.startsWith(dateValue(day)) ? min.slice(11, 16) : undefined, kind === "time" ? max : day && max?.startsWith(dateValue(day)) ? max.slice(11, 16) : undefined);
  const options = [...new Set([...times, ...(time && !times.includes(time) ? [time] : [])])].sort().map(t => ({ value: t, label: t }));
  return <div className="rp-control rp-date-control"><input type="hidden" name={disabled ? undefined : name} value={current}/><Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger id={id} className="rp-select" disabled={disabled} aria-label={label} aria-invalid={invalid}><span>{display || (kind === "time" ? "Choisir une heure" : "Choisir une date")}</span>{kind === "time" ? <Clock3 size={15}/> : <CalendarDays size={15}/>}</Popover.Trigger><Popover.Portal><Popover.Content className="rp-popover rp-date-popover" align="start" sideOffset={6} collisionPadding={10}>
    {kind !== "time" && <DayPicker mode="single" locale={fr} selected={day} defaultMonth={day} startMonth={new Date(1900, 0)} endMonth={new Date(2100, 11)} disabled={restrictions} components={calendarComponents} showOutsideDays onSelect={date => { if (date) { change(`${dateValue(date)}${kind === "datetime-local" ? `T${time || "09:00"}` : ""}`); if (kind === "date") setOpen(false); } }}/ >}
    {kind !== "date" && <div className="rp-time-row"><Clock3 size={16}/><RPilotSelect aria-label="Heure (format 24 heures)" value={time} placeholder="Heure" onValueChange={updateTime} options={options}/></div>}
    <div className="rp-picker-footer">{!required && <button type="button" className="btn ghost small" onClick={() => { change(""); setOpen(false); }}><X size={13}/>Effacer</button>}<button type="button" className="btn primary small" onClick={() => setOpen(false)}>Terminer</button></div>
  </Popover.Content></Popover.Portal></Popover.Root>{!disabled && <input className="rp-validation" tabIndex={-1} aria-hidden="true" value={valid ? current : ""} required={required || !!current} onChange={() => {}} onInvalid={e => { e.preventDefault(); setInvalid(true); e.currentTarget.parentElement?.querySelector('button')?.focus(); }}/ >}{invalid && <small className="rp-error" role="alert">Choisissez une {kind === "time" ? "heure" : "date"} valide dans la période autorisée.</small>}</div>;
}
export function RPilotDatePicker(props: Omit<Props, "kind">) { return <RPilotDateTimePicker {...props} kind="date"/>; }
export function RPilotTimePicker(props: Omit<Props, "kind">) { return <RPilotDateTimePicker {...props} kind="time"/>; }
export function RPilotDateRangePicker({ value, onValueChange, disabledDates, label = "Période" }: { value: DateRange | undefined; onValueChange: (value: DateRange | undefined) => void; disabledDates?: Matcher | Matcher[]; label?: string }) {
  return <Popover.Root><Popover.Trigger className="rp-select" aria-label={label}>{value?.from ? `${value.from.toLocaleDateString("fr-FR")} → ${value.to?.toLocaleDateString("fr-FR") || "…"}` : "Choisir une période"}<CalendarDays size={15}/></Popover.Trigger><Popover.Portal><Popover.Content className="rp-popover rp-date-popover" align="start" sideOffset={6} collisionPadding={10}><DayPicker mode="range" locale={fr} selected={value} onSelect={onValueChange} disabled={disabledDates} excludeDisabled components={calendarComponents} startMonth={new Date(1900, 0)} endMonth={new Date(2100, 11)}/></Popover.Content></Popover.Portal></Popover.Root>;
}

"use client";
import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import dynamic from "next/dynamic";
const RPilotDateTimePicker = dynamic(() => import("./date-picker").then(m => m.RPilotDateTimePicker));
export const RPilotInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function RPilotInput({ type, ...props }, ref) {
  const [error, setError] = useState("");
  const errorId = useId();
  if (type === "date" || type === "datetime-local" || type === "time") return <RPilotDateTimePicker kind={type === "date" ? "date" : type === "time" ? "time" : "datetime-local"} name={props.name} id={props.id} disabled={props.disabled} required={props.required} value={props.value === undefined ? undefined : String(props.value)} defaultValue={String(props.defaultValue ?? "")} min={props.min === undefined ? undefined : String(props.min)} max={props.max === undefined ? undefined : String(props.max)} label={props["aria-label"]}/>;
  return <><input {...props} autoComplete={props.autoComplete ?? "off"} type={type} ref={ref} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={error ? `${props["aria-describedby"] || ""} ${errorId}`.trim() : props["aria-describedby"]} onInvalid={e => { props.onInvalid?.(e); e.preventDefault(); setError(e.currentTarget.validationMessage); e.currentTarget.focus(); }} onChange={e => { setError(""); props.onChange?.(e); }} className={`${type === "checkbox" || type === "radio" ? "rp-choice" : "rp-input"} ${props.className || ""}`}/>{error && <small className="rp-error" role="alert" id={errorId}>{error}</small>}</>;
});
export const RPilotNumberInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function RPilotNumberInput(props, ref) { return <RPilotInput {...props} ref={ref} type="number"/>; });

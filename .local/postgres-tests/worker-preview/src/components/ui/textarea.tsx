"use client";
import { forwardRef, useId, useState, type TextareaHTMLAttributes } from "react";
export const RPilotTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function RPilotTextarea(props, ref) {
  const [error, setError] = useState(""); const errorId = useId();
  return <><textarea {...props} autoComplete={props.autoComplete ?? "off"} ref={ref} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={error ? `${props["aria-describedby"] || ""} ${errorId}`.trim() : props["aria-describedby"]} onInvalid={e => { props.onInvalid?.(e); e.preventDefault(); setError(e.currentTarget.validationMessage); e.currentTarget.focus(); }} onChange={e => { setError(""); props.onChange?.(e); }}/>{error && <small className="rp-error" role="alert" id={errorId}>{error}</small>}</>;
});

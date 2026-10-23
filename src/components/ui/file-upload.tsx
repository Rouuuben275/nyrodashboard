"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
export function RPilotFileUpload({ accept = ["image/png", "image/jpeg", "application/pdf"], maxBytes = 5 * 1024 * 1024, onUpload, disabled, autoUpload=false, onPendingChange, onRemove }: { autoUpload?:boolean;onPendingChange?:(pending:boolean)=>void;onRemove?:()=>void; accept?: string[]; maxBytes?: number; disabled?: boolean; onUpload: (file: File, signal: AbortSignal, onProgress: (value: number) => void) => Promise<void> }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!file?.type.startsWith("image/")) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  useEffect(() => () => controller.current?.abort(), []);
  function choose(next?: File) { setError(""); if (!next) return; if (!accept.includes(next.type)) { setError("Ce type de fichier n’est pas autorisé."); return; } if (next.size > maxBytes) { setError(`Taille maximale : ${Math.round(maxBytes / 1024 / 1024)} Mo.`); return; } setFile(next); setProgress(null); onPendingChange?.(true); if(autoUpload)void upload(next); }
  async function upload(selected=file) { if (!selected) return; const abort = new AbortController(); controller.current = abort; setError(""); setProgress(0); try { await onUpload(selected, abort.signal, p => { if (!abort.signal.aborted) setProgress(Math.min(99, Math.max(0, p))); }); if (!abort.signal.aborted) {setProgress(100);onPendingChange?.(false);} } catch (e) { if (!abort.signal.aborted) { setProgress(null); setError(e instanceof Error?e.message:"Le transfert a échoué. Réessayez."); } } }
  const uploading = progress !== null && progress < 100;
  return <div className="rp-upload"><input id={id} ref={input} type="file" accept={accept.join(",")} hidden disabled={disabled || uploading} onChange={e => choose(e.target.files?.[0])}/><button type="button" disabled={disabled || uploading} className="rp-dropzone" onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!disabled && !uploading) choose(e.dataTransfer.files[0]); }}><Upload size={22}/><strong>Choisir un fichier ou le déposer ici</strong><span>{accept.join(" · ")} · {Math.round(maxBytes / 1024 / 1024)} Mo max.</span></button>{file && <div className="rp-upload-file">{preview && <img src={preview} alt="Aperçu local du fichier"/>}<span>{file.name}<small>{Math.ceil(file.size / 1024)} Ko</small></span><button type="button" className="icon-btn" disabled={disabled} aria-label="Retirer le fichier sélectionné" onClick={() => { controller.current?.abort(); setFile(null); setProgress(null);onPendingChange?.(false);onRemove?.(); if (input.current) input.current.value = ""; }}><X size={16}/></button><button type="button" className="btn primary small" disabled={disabled || uploading || progress === 100} onClick={() => void upload(file)}>{progress === 100 ? "Transféré" : "Transférer"}</button></div>}{progress !== null && <progress max={100} value={progress} aria-label="Progression du transfert"/>}{error && <p className="rp-error" role="alert">{error}</p>}</div>;
}

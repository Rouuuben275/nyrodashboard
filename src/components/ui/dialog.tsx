"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Modal({ title, description, open, onOpenChange, children, wide = false, preventClose = false, drawer = false }: { title: string; description?: string; open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode; wide?: boolean; preventClose?: boolean; drawer?: boolean }) {
  return <DialogPrimitive.Root open={open} onOpenChange={v => { if (!preventClose) onOpenChange(v); }}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="modal-overlay"/><DialogPrimitive.Content onEscapeKeyDown={e => { if (preventClose) e.preventDefault(); }} onInteractOutside={e => { if (preventClose) e.preventDefault(); }} className={`modal ${wide ? "wide" : ""} ${drawer ? "rp-drawer" : ""}`}><div className="modal-heading"><div><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Description>{description || "Renseignez les informations puis confirmez votre action."}</DialogPrimitive.Description></div><DialogPrimitive.Close disabled={preventClose} className="icon-btn" aria-label="Fermer"><X size={18}/></DialogPrimitive.Close></div>{children}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
export const RPilotDialog = Modal;
export function RPilotDrawer(props: React.ComponentProps<typeof Modal>) { return <Modal {...props} drawer/>; }

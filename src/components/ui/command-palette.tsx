"use client";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Modal } from "./dialog";
export function RPilotCommandPalette({ open, onOpenChange, items }: { open: boolean; onOpenChange: (open: boolean) => void; items: { id: string; label: string; group: string; onSelect: () => void }[] }) {
  return <Modal open={open} onOpenChange={onOpenChange} title="Rechercher dans votre espace" description="Naviguez au clavier avec les flèches, Entrée et Échap."><Command label="Recherche globale"><div className="rp-command-search"><Search size={16}/><Command.Input autoFocus placeholder="Rechercher une page, un employé, un produit…"/></div><Command.List><Command.Empty>Aucun résultat accessible.</Command.Empty>{[...new Set(items.map(i => i.group))].map(group => <Command.Group heading={group} key={group}>{items.filter(i => i.group === group).map(item => <Command.Item key={item.id} value={`${item.label} ${item.id}`} onSelect={() => { onOpenChange(false); item.onSelect(); }}>{item.label}</Command.Item>)}</Command.Group>)}</Command.List></Command></Modal>;
}

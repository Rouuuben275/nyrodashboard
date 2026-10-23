"use client";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Menu } from "lucide-react";
export function LandingMenu({ links }: { links: string[][] }) {
  const [open, setOpen] = useState(false);
  return <details className="landing-mobile-menu" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary role="button" aria-label="Ouvrir la navigation"><Menu size={21}/></summary><nav aria-label="Navigation mobile">{links.map(([title, id]) => <a href={`#${id}`} key={id} onClick={() => setOpen(false)}>{title}<ArrowRight size={13}/></a>)}<a href="/login" onClick={() => setOpen(false)}>Commencer avec Discord<ArrowUpRight size={13}/></a></nav></details>;
}

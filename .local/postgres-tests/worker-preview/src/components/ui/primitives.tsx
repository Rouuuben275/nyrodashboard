"use client";
import type { ReactNode } from "react";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as Radio from "@radix-ui/react-radio-group";
import * as Switch from "@radix-ui/react-switch";
import * as Slider from "@radix-ui/react-slider";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Check, Inbox } from "lucide-react";
export function RPilotCheckbox(props: React.ComponentProps<typeof Checkbox.Root>) { return <Checkbox.Root {...props} className={`rp-checkbox ${props.className || ""}`}><Checkbox.Indicator><Check size={13}/></Checkbox.Indicator></Checkbox.Root>; }
export function RPilotRadioGroup({ options, ...props }: React.ComponentProps<typeof Radio.Root> & { options: { value: string; label: string; disabled?: boolean }[] }) { return <Radio.Root {...props} className="rp-radio-group">{options.map(o => <label key={o.value}><Radio.Item className="rp-radio" value={o.value} disabled={o.disabled}><Radio.Indicator/></Radio.Item>{o.label}</label>)}</Radio.Root>; }
export function RPilotSwitch(props: React.ComponentProps<typeof Switch.Root>) { return <Switch.Root {...props} className="rp-switch"><Switch.Thumb/></Switch.Root>; }
export function RPilotSlider(props: React.ComponentProps<typeof Slider.Root>) { return <Slider.Root {...props} className="rp-slider"><Slider.Track><Slider.Range/></Slider.Track>{(props.value || props.defaultValue || [0]).map((_, i) => <Slider.Thumb key={i} aria-label={`${props["aria-label"] || "Valeur"} ${i + 1}`}/>)}</Slider.Root>; }
export function RPilotTabs({ tabs, ...props }: React.ComponentProps<typeof Tabs.Root> & { tabs: { value: string; label: string; content: ReactNode; disabled?: boolean }[] }) { return <Tabs.Root {...props}><Tabs.List className="rp-tabs" aria-label={props["aria-label"]}>{tabs.map(t => <Tabs.Trigger value={t.value} key={t.value} disabled={t.disabled}>{t.label}</Tabs.Trigger>)}</Tabs.List>{tabs.map(t => <Tabs.Content className="rp-tab-content" value={t.value} key={t.value}>{t.content}</Tabs.Content>)}</Tabs.Root>; }
export function RPilotTooltip({ content, children }: { content: ReactNode; children: ReactNode }) { return <Tooltip.Provider delayDuration={350}><Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="rp-tooltip" sideOffset={7} collisionPadding={8}>{content}<Tooltip.Arrow/></Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>; }
export function RPilotScrollArea({ children, className = "" }: { children: ReactNode; className?: string }) { return <ScrollArea.Root className={`rp-scroll-area ${className}`}><ScrollArea.Viewport>{children}</ScrollArea.Viewport><ScrollArea.Scrollbar className="rp-scrollbar" orientation="vertical"><ScrollArea.Thumb/></ScrollArea.Scrollbar></ScrollArea.Root>; }
export function RPilotBadge({ children }: { children: ReactNode }) { return <span className="badge neutral">{children}</span>; }
export function RPilotEmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <div className="empty"><Inbox size={26}/><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>; }
export function RPilotSkeleton({ lines = 3 }: { lines?: number }) { return <div aria-busy="true" aria-label="Chargement en cours" className="rp-skeleton">{Array.from({ length: Math.max(1, Math.min(lines, 20)) }, (_, i) => <span key={i}/>)}</div>; }
export function RPilotStepper({ steps, current }: { steps: string[]; current: number }) { return <ol className="rp-stepper" aria-label="Progression">{steps.map((step, i) => <li key={step} aria-current={i === current ? "step" : undefined}><span>{i < current ? <Check size={13}/> : i + 1}</span>{step}</li>)}</ol>; }
export function RPilotPagination({ page, pages, onPageChange }: { page: number; pages: number; onPageChange: (page: number) => void }) { return <nav aria-label="Pagination" className="table-pagination"><span>Page {page} sur {Math.max(1, pages)}</span><div><button type="button" className="btn outline small" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Précédente</button><button type="button" className="btn outline small" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Suivante</button></div></nav>; }

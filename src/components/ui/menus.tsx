"use client";
import type { ReactNode } from "react";
import * as Context from "@radix-ui/react-context-menu";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronRight } from "lucide-react";
export type MenuAction = { label: string; icon?: ReactNode; shortcut?: string; disabled?: boolean; separator?: boolean; children?: MenuAction[]; onSelect?: () => void; dangerous?: boolean };
// Dangerous actions open a caller-provided confirmation dialog. Menus never
// execute destructive callbacks directly, including keyboard activation.
function Items({ items, context, onDangerous }: { items: MenuAction[]; context?: boolean; onDangerous?: (action: MenuAction) => void }) {
  const Menu = context ? Context : Dropdown;
  return <>{items.map((item, i) => item.children ? <Menu.Sub key={i}><Menu.SubTrigger disabled={item.disabled}>{item.icon}{item.label}<ChevronRight size={13}/></Menu.SubTrigger><Menu.Portal><Menu.SubContent className="dropdown rp-menu">{<Items items={item.children} context={context} onDangerous={onDangerous}/>}</Menu.SubContent></Menu.Portal></Menu.Sub> : <span key={i} className="rp-menu-part">{item.separator && <Menu.Separator/>}<Menu.Item disabled={item.disabled || (item.dangerous && !onDangerous)} onSelect={() => item.dangerous ? onDangerous?.(item) : item.onSelect?.()}>{item.icon}{item.label}{item.shortcut && <kbd>{item.shortcut}</kbd>}</Menu.Item></span>)}</>;
}
export function RPilotDropdownMenu({ trigger, items, label, onDangerous }: { trigger: ReactNode; items: MenuAction[]; label?: string; onDangerous?: (action: MenuAction) => void }) { return <Dropdown.Root><Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown rp-menu" sideOffset={6} collisionPadding={10} align="end">{label && <Dropdown.Label>{label}</Dropdown.Label>}<Items items={items} onDangerous={onDangerous}/></Dropdown.Content></Dropdown.Portal></Dropdown.Root>; }
export function RPilotContextMenu({ children, items, onDangerous }: { children: ReactNode; items: MenuAction[]; onDangerous?: (action: MenuAction) => void }) { return <Context.Root><Context.Trigger asChild>{children}</Context.Trigger><Context.Portal><Context.Content className="dropdown rp-menu" collisionPadding={10}><Items items={items} context onDangerous={onDangerous}/></Context.Content></Context.Portal></Context.Root>; }

"use client";
import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
export function RPilotPopover({ trigger, children, open, onOpenChange }: { trigger: ReactNode; children: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) { return <Popover.Root open={open} onOpenChange={onOpenChange}><Popover.Trigger asChild>{trigger}</Popover.Trigger><Popover.Portal><Popover.Content className="rp-popover" align="start" sideOffset={6} collisionPadding={12}>{children}</Popover.Content></Popover.Portal></Popover.Root>; }

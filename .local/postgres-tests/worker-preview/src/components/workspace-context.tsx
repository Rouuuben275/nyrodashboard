"use client";
import { createContext, useContext } from "react";
import type { WorkspaceData } from "@/domains/core/queries";
export type FormKind = "company" | "server" | "sale" | "product" | "invite" | "role" | "shift" | "leave" | "expense" | "task" | "stock" | "settings" | "member" | "profile" | "cancel" | "leaveDecision" | "accept";
export type Current = NonNullable<WorkspaceData["current"]>;
export type View = "statistics" | "equipment" | "messages" | "cash" | "notifications" | "documents" | "calendar" | "announcements" | "reviews" | "sanctions" | "payroll" | "recruitment" | "dashboard" | "employees" | "roles" | "planning" | "time" | "leaves" | "sales" | "finance" | "expenses" | "products" | "inventory" | "tasks" | "modules" | "audit" | "settings" | "servers" | "companies" | "subscription" | "crm" | "quotes" | "invoices" | "suppliers" | "orders";
type Context = { data: WorkspaceData; current: Current | null; user: { id: string; name: string; email: string }; view: View; navigate: (v: View) => void; open: (kind: FormKind, record?: Record<string, unknown>) => void; mutate: (payload: Record<string, unknown>, message?: string) => Promise<Record<string, unknown>>; busy: boolean; allowed: (permission: string) => boolean; refresh: (companyId?: string) => Promise<void> };
export const WorkspaceContext = createContext<Context | null>(null);
export function useWorkspace() { const ctx = useContext(WorkspaceContext); if (!ctx) throw new Error("Workspace context missing"); return ctx; }

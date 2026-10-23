import {calendarActions} from "@/domains/calendar/validation";
import {announcementActions} from "@/domains/announcements/validation";
import {taskActions} from "@/domains/tasks/validation";
import {recruitmentActions,candidateActions} from "@/domains/recruitment/validation";
import {scheduleActions} from "@/domains/planning/validation";
import { z } from "zod";
import { commerceActions } from "@/domains/commerce/validation";
import { purchaseActions } from "@/domains/purchasing/validation";
import { hrActions } from "@/domains/hr/validation";
import {timeActions} from "@/domains/time/validation";
import {payrollActions} from "@/domains/payroll/validation";
import {peopleActions} from "@/domains/people/validation";
import { stockActions } from "@/domains/inventory/validation";
import { financeActions } from "@/domains/finance/validation";
import { AppError } from "./errors";
import {logoFields} from "@/domains/media/validation";
const id = z.string().min(1).max(100);
const text = z.string().trim().min(1).max(160);
const cents = z.number().int().min(0).max(100_000_000);
const date = z.iso.datetime({ offset: true });
const range = { start: date, end: date };
export const actionSchema = z.discriminatedUnion("action", [
  ...calendarActions,
  ...announcementActions,
  ...taskActions,
  ...commerceActions,
  ...purchaseActions,
  ...hrActions,
  ...financeActions,
  ...stockActions,
  ...timeActions,
  ...payrollActions,
  ...peopleActions,
  ...scheduleActions,
  ...recruitmentActions,
  ...candidateActions,
  z.object({ action: z.literal("company.create"), name: text, sector: text, serverId: id.optional(),...logoFields, template: z.enum(["garage", "restaurant", "blank"]).default("garage") }),
  z.object({ action: z.literal("server.create"), name: text, description: z.string().max(1000).default("") }),
  z.object({ action: z.literal("company.update"), name: text, description: z.string().max(2000), expenseThreshold: cents, serverId: id.nullable().optional(),...logoFields }),
  z.object({ action: z.literal("role.create"), name: text, permissions: z.array(z.string().max(80)).max(50) }),
  z.object({ action: z.literal("role.update"), roleId: id, name: text, permissions: z.array(z.string().max(80)).max(50) }),
  z.object({ action: z.literal("role.reorder"), roleIds: z.array(id).min(1).max(100) }),
  z.object({ action: z.literal("role.delete"), roleId: id, replacementId: id.optional(), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("invite.create"), email: z.email().max(254), roleId: id }),
  z.object({ action: z.literal("invite.accept"), token: z.string().min(32).max(200), characterName: text }),
  z.object({ action: z.literal("invite.decline"), invitationId: id }),
  z.object({ action: z.literal("member.update"), memberId: id, roleId: id, department: text, status: z.enum(["ACTIVE", "INACTIVE"]), salary: cents }),
  z.object({ action: z.literal("module.toggle"), key: text, enabled: z.boolean() }),
  z.object({ action: z.literal("product.create"), name: text, sku: text, category: text, price: cents, cost: cents, stock: z.number().int().min(0).max(1000000), threshold: z.number().int().min(0).max(1000000), trackStock: z.boolean() }),
  z.object({ action: z.literal("product.update"), productId: id, name: text, sku: text, category: text, price: cents, cost: cents, threshold: z.number().int().min(0).max(1000000) }),
  z.object({ action: z.literal("product.archive"), productId: id, archived: z.boolean() }),
  z.object({ action: z.literal("inventory.adjust"), productId: id, quantity: z.number().int().min(-1000000).max(1000000).refine(v => v !== 0), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("sale.create"), customer: text, payment: z.enum(["Carte RP", "Espèces RP", "Virement RP"]), requestKey: z.string().uuid(), discountBps: z.number().int().min(0).max(10000).default(0), channel: z.enum(["SALES","CASH"]).default("SALES"), expectedTotal: z.number().int().min(0).max(2_000_000_000).optional(), items: z.array(z.object({ productId: id, quantity: z.number().int().min(1).max(10000) })).min(1).max(100) }),
  z.object({ action: z.literal("sale.cancel"), saleId: id, reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("expense.create"), label: text, amount: cents.refine(v => v > 0), category: text }),
  z.object({ action: z.literal("expense.decide"), expenseId: id, approve: z.boolean() }),
  z.object({ action: z.literal("shift.create"), memberId: id, title: text, ...range }),
  z.object({ action: z.literal("shift.update"), shiftId: id, revision:z.number().int().min(0).optional(), memberId: id, title: text, ...range }),
  z.object({ action: z.literal("shift.delete"), shiftId: id }),
  z.object({ action: z.literal("time.toggle") }),
  z.object({ action: z.literal("leave.create"), requestKey:z.uuid().optional(),typeId:id.optional(),...range, reason: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal("leave.decide"), requestKey:z.uuid().optional(),revision:z.number().int().min(0).optional(),cancelConflictingShifts:z.boolean().default(false),leaveId: id, approve: z.boolean(), reason: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal("notification.read"), notificationId: id }),
  z.object({ action: z.literal("character.create"), name: text, phone: z.string().max(50).optional() }),
]);
export type Action = z.infer<typeof actionSchema>;
export function safeTotal(items: { quantity: number; price: number }[]) {
  const total = items.reduce((sum, i) => sum + i.quantity * i.price, 0);
  if (!Number.isSafeInteger(total) || total < 0 || total > 2_000_000_000) throw new AppError("Montant hors limites.");
  return total;
}

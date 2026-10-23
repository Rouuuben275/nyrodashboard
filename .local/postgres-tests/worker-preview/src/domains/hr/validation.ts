import { z } from "zod";
const id = z.string().min(1).max(100);
export const hrActions = [
  z.object({ action: z.literal("employee.profile"), memberId: id, characterName: z.string().trim().min(1).max(160), phone: z.string().trim().max(60), jobTitle: z.string().trim().max(160), biography: z.string().trim().max(3000) }),
  z.object({ action: z.literal("employee.event"), memberId: id, kind: z.enum(["NOTE", "TRAINING", "CERTIFICATION", "CAREER"]), title: z.string().trim().min(1).max(160), content: z.string().trim().min(3).max(5000) }),
] as const;
export const employeeQuery = z.object({ companyId: id, memberId: id, cursor: id.optional() });

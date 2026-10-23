import {z} from "zod";
export const logoFields={logoAssetId:z.uuid().nullable().optional(),logoUrl:z.union([z.literal(""),z.url().max(2000).refine(v=>new URL(v).protocol==="https:","Une URL HTTPS est requise.")]).optional()};
export const uploadQuery=z.object({purpose:z.enum(["company","server"]),entityId:z.string().min(1).max(100).optional()});
export const MAX_LOGO_BYTES=256*1024;

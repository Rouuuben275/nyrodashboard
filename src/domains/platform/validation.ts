import {z} from "zod";
import {platformPermissions} from "./permissions";
import {logoFields} from "@/domains/media/validation";
const id=z.string().min(1).max(100),discordId=z.string().regex(/^\d{17,20}$/,"Identifiant Discord invalide."),reason=z.string().trim().min(3).max(500),revision=z.number().int().nonnegative();
const image=z.union([z.literal(""),z.url().max(2000).refine(v=>new URL(v).protocol==="https:","Une URL HTTPS est requise.")]).default("");
export const serverFields={name:z.string().trim().min(3).max(100),description:z.string().trim().max(1000).default(""),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(80),logoUrl:image,logoAssetId:logoFields.logoAssetId,bannerUrl:image,visibility:z.enum(["PRIVATE","PUBLIC"]).default("PRIVATE"),accessMode:z.enum(["PRIVATE","REQUEST","OPEN"]).default("PRIVATE"),maxCompanies:z.number().int().min(1).max(100000),maxUsers:z.number().int().min(1).max(1000000)};
export const platformAction=z.discriminatedUnion("action",[
  z.object({action:z.literal("user.slots.grant"),discordId,quantity:z.number().int().min(1).max(100),revision:revision.optional(),reason}),
  z.object({action:z.literal("server.create"),...serverFields,reason}),
  z.object({action:z.literal("server.update"),id,revision,...serverFields,reason}),
  z.object({action:z.literal("server.grant"),serverId:id,discordId,roleId:id,expiresAt:z.iso.datetime().nullable().default(null),status:z.enum(["ACTIVE","REVOKED"]),revision:revision.optional(),reason}),
  z.object({action:z.literal("platform.grant"),discordId,permissions:z.array(z.enum(platformPermissions)).min(1).max(platformPermissions.length),expiresAt:z.iso.datetime().nullable().default(null),status:z.enum(["ACTIVE","REVOKED"]),revision:revision.optional(),reason}),
  z.object({action:z.literal("access.status"),target:z.enum(["user","company","server"]),id,revision,status:z.enum(["ACTIVE","SUSPENDED","ARCHIVED"]),until:z.iso.datetime().nullable().default(null),confirmation:id,reason}),
  z.object({action:z.literal("sessions.revoke"),id,confirmation:id,reason}),
]);
export const platformQuery=z.object({view:z.enum(["dashboard","servers","users","companies","administrators","audit"]).default("dashboard"),q:z.string().trim().max(100).default(""),page:z.coerce.number().int().min(1).max(100000).default(1),grantPage:z.coerce.number().int().min(1).max(100000).default(1),memberPage:z.coerce.number().int().min(1).max(100000).default(1),days:z.coerce.number().int().min(1).max(366).default(30),status:z.enum(["ACTIVE","SUSPENDED","ARCHIVED","REVOKED"]).optional(),sort:z.enum(["newest","oldest","name"]).default("newest"),id:id.optional()});

import {z} from "zod";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {assertActiveUser} from "@/domains/platform/access";
import {AppError} from "@/domains/core/errors";
import {parisDay} from "@/domains/planning/recurrence";
import {notificationCategoryKeys,notificationUrl} from "./constants";
const category=z.enum(notificationCategoryKeys);
const day=z.iso.date().refine(s=>s>="2000-01-01"&&s<="2100-12-31");
export const notificationQuery=z.object({q:z.string().trim().max(120).default(""),state:z.enum(["all","unread","read"]).default("all"),category:category.optional(),page:z.coerce.number().int().min(1).max(100000).default(1),from:day.optional(),to:day.optional()}).strict().refine(q=>!q.from||!q.to||q.from<=q.to,"Période invalide.");
const action=z.discriminatedUnion("action",[
 z.object({action:z.literal("read"),id:z.string().min(1).max(100),read:z.boolean()}).strict(),
 z.object({action:z.literal("readAll"),filter:notificationQuery}).strict(),
 z.object({action:z.literal("preferences"),muted:category.array().max(notificationCategoryKeys.length).refine(v=>new Set(v).size===v.length)}).strict(),
]);
function where(userId:string,q:z.infer<typeof notificationQuery>):Prisma.NotificationWhereInput{return {userId,...(q.state==="unread"?{readAt:null}:q.state==="read"?{readAt:{not:null}}:{}),...(q.category?{category:q.category}:{}),...(q.q?{OR:[{title:{contains:q.q,mode:"insensitive"}},{body:{contains:q.q,mode:"insensitive"}}]}:{}),...(q.from||q.to?{createdAt:{...(q.from?{gte:parisDay(q.from)}:{}),...(q.to?{lt:parisDay(q.to,1)}:{})}}:{})};}
export async function readNotifications(userId:string,raw:unknown){const q=notificationQuery.parse(raw);return db.$transaction(async tx=>{
 await assertActiveUser(tx,userId);const [rows,total,unread,preferences]=await Promise.all([
 tx.notification.findMany({where:where(userId,q),select:{id:true,title:true,body:true,category:true,targetUrl:true,readAt:true,createdAt:true},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(q.page-1)*25,take:25}),
 tx.notification.count({where:where(userId,q)}),tx.notification.count({where:{userId,readAt:null}}),tx.user.findUniqueOrThrow({where:{id:userId},select:{notificationMutedCategories:true}})]);
 return {rows:rows.map(n=>({...n,targetUrl:notificationUrl(n.targetUrl)})),total,unread,muted:preferences.notificationMutedCategories};
 },{isolationLevel:"RepeatableRead"});}
export async function writeNotification(userId:string,raw:unknown){
 await assertActiveUser(db,userId);const key=`notifications:${userId}:${Math.floor(Date.now()/60000)}`;
 const rate=await db.rateLimit.upsert({where:{key},create:{key,count:1,lastRequest:BigInt(Date.now())},update:{count:{increment:1},lastRequest:BigInt(Date.now())}});if(rate.count>60)throw new AppError("Trop d’actions. Réessayez dans une minute.",429);
 const input=action.parse(raw);
 return db.$transaction(async tx=>{
 await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`notifications:${userId}`}))::text`;
 await assertActiveUser(tx,userId);
 if(input.action==="preferences"){await tx.user.update({where:{id:userId},data:{notificationMutedCategories:input.muted}});return {ok:true};}
 if(input.action==="readAll"){return tx.notification.updateMany({where:{AND:[where(userId,input.filter),{readAt:null},{createdAt:{lte:new Date()}}]},data:{readAt:new Date()}});}
 const old=await tx.notification.findFirst({where:{id:input.id,userId},select:{id:true,readAt:true}});if(!old)throw new AppError("Notification introuvable.",404);
 if(input.read?!old.readAt:!!old.readAt)await tx.notification.updateMany({where:{id:input.id,userId,...(input.read?{readAt:null}:{})},data:{readAt:input.read?new Date():null}});
 return {ok:true};
 });
}
export type NotificationsData=Awaited<ReturnType<typeof readNotifications>>;

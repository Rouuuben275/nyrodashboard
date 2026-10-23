import type {Prisma} from "@prisma/client";
import {notificationUrl,type NotificationCategory} from "./constants";
type Notice={userId:string;title:string;body:string;category:NotificationCategory;targetUrl?:string};
// Called in the business transaction: a rolled-back operation never leaves a notice.
// Preferences affect future deliveries, never erase or hide the existing history.
export async function notifyUsers(tx:Prisma.TransactionClient,notices:Notice[]){
 if(!notices.length)return {count:0};
 const users=await tx.user.findMany({where:{id:{in:[...new Set(notices.map(n=>n.userId))]}},select:{id:true,notificationMutedCategories:true}});
 const preferences=new Map(users.map(u=>[u.id,u.notificationMutedCategories]));
 const data=notices.filter(n=>preferences.has(n.userId)&&!preferences.get(n.userId)!.includes(n.category)).map(n=>({...n,targetUrl:notificationUrl(n.targetUrl)}));
 if(!data.length)return {count:0};return tx.notification.createMany({data});
}
export const notifyUser=(tx:Prisma.TransactionClient,notice:Notice)=>notifyUsers(tx,[notice]);

import {auth} from "./auth";
import {db} from "./db";
import {activeAccess} from "@/domains/platform/access";
export async function activeSession(options:{headers:Headers}){
  const session=await auth.api.getSession(options);if(!session)return null;
  const user=await db.user.findUnique({where:{id:session.user.id},select:{accessStatus:true,suspendedUntil:true}});
  return user&&activeAccess(user.accessStatus,user.suspendedUntil)?session:null;
}

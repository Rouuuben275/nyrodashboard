import {NextResponse,type NextRequest} from "next/server";
export function proxy(request:NextRequest){
  // The development UI must never expose a production page, even before streaming.
  if(process.env.NODE_ENV!=="development"&&request.nextUrl.pathname==="/dev/ui")return new NextResponse("Page introuvable",{status:404,headers:{"Cache-Control":"no-store"}});
  return NextResponse.next();
}
export const config={matcher:["/dev/ui"]};

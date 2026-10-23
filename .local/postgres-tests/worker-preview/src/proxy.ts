import {NextResponse,type NextRequest} from "next/server";
export function proxy(request:NextRequest){
  // Deny before streaming begins: vinext can otherwise send a 200 shell before
  // a page's notFound() is rendered. No data or authentication bypass here.
  if(process.env.NODE_ENV!=="development"&&request.nextUrl.pathname==="/dev/ui")return new NextResponse("Page introuvable",{status:404,headers:{"Cache-Control":"no-store"}});
  return NextResponse.next();
}
export const config={matcher:["/dev/ui"]};

import {createSearchIndex} from "@/content/docs/content";
export const dynamic="force-static";
export function GET(){return Response.json(createSearchIndex(),{headers:{"Cache-Control":"public, max-age=3600, stale-while-revalidate=86400","X-Content-Type-Options":"nosniff"}});}

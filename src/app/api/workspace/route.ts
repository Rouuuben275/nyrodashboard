import {activeSession} from "@/lib/active-session";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/domains/core/queries";
import { execute } from "@/domains/core/service";
import { AppError } from "@/domains/core/errors";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import {databaseRuntime} from "@/lib/database-runtime";

export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: error.issues.map(i => `${i.path.join(".")} : ${i.message}`).join(" · ") }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Cet enregistrement existe déjà." }, { status: 409 });
  console.error("Workspace request failed", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ error: "L’opération a échoué. Réessayez." }, { status: 500 });
}
export async function GET(req: Request) {
  try {
    const session = await activeSession({ headers: req.headers });
    if (!session) return Response.json({ error: "Connexion requise." }, { status: 401 });
    const params=new URL(req.url).searchParams;const data = await getWorkspace(session.user.id, params.get("companyId") || undefined,params.get("space")||undefined);
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    const expectedOrigin = new URL(databaseRuntime().env.BETTER_AUTH_URL || req.url).origin;
    if (origin !== expectedOrigin) return Response.json({ error: "Origine de la requête refusée." }, { status: 403 });
    if (Number(req.headers.get("content-length") || 0) > 32000) return Response.json({ error: "Requête trop volumineuse." }, { status: 413 });
    const session = await activeSession({ headers: req.headers });
    if (!session) return Response.json({ error: "Connexion requise." }, { status: 401 });
    const text = await req.text();
    if (text.length > 32000) return Response.json({ error: "Requête trop volumineuse." }, { status: 413 });
    let body;
    try { body = JSON.parse(text); } catch { return Response.json({ error: "Requête JSON invalide." }, { status: 400 }); }
    const result = await execute(session.user, body && typeof body.companyId === "string" ? body.companyId : undefined, body);
    return Response.json({ data: result });
  } catch (error) { return failure(error); }
}

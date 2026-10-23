import {activeSession} from "@/lib/active-session";
import { auth } from "@/lib/auth";
import { AppError } from "@/domains/core/errors";
import { getEmployeeDossier } from "@/domains/hr/service";
import { employeeQuery } from "@/domains/hr/validation";
import { ZodError } from "zod";
export async function GET(req: Request) {
  try {
    const session = await activeSession({ headers: req.headers });
    if (!session) return Response.json({ error: "Connexion requise." }, { status: 401 });
    const query = employeeQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
    const data = await getEmployeeDossier(session.user.id, query.companyId, query.memberId, query.cursor);
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ error: "Paramètres du dossier invalides." }, { status: 400 });
    return Response.json({ error: "Chargement du dossier impossible." }, { status: 500 });
  }
}

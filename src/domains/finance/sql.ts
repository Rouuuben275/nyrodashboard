import {Prisma} from "@prisma/client";
import {incomeKinds,expenseKinds} from "./constants";
// The e alias is shared by the journal and reporting queries. Legacy entries
// use the same classification as new postings, without rewriting any row.
export const ledgerEffect=Prisma.sql`COALESCE(e.effect,CASE WHEN e.kind IN (${Prisma.join(incomeKinds)}) THEN 'INCOME' WHEN e.kind IN (${Prisma.join(expenseKinds)}) THEN 'EXPENSE' ELSE 'NEUTRAL' END)`;

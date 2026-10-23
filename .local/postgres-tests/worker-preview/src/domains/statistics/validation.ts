import {z} from "zod";
import {widgets} from "./constants";
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),day=z.iso.date().refine(v=>v>="2000-01-01"&&v<="2100-12-31");
export const statisticsQuery=z.strictObject({companyId:id,from:day,to:day,section:z.enum(["overview","finance","sellers","products","people","stock","orders"]).default("overview"),page:z.coerce.number().int().min(1).max(100000).default(1)}).refine(v=>v.to>=v.from&&(+new Date(v.to)-+new Date(v.from))/86400000<366,"Choisissez une période comprise entre 1 et 366 jours.");
export const layoutAction=z.strictObject({companyId:id,requestKey:z.uuid(),revision:z.number().int().nonnegative(),widgets:z.array(z.enum(widgets)).max(5).refine(v=>new Set(v).size===v.length,"Widget dupliqué.")});

export const notificationCategories={GENERAL:"Général",MESSAGES:"Messagerie",EQUIPMENT:"Véhicules et équipements",PLANNING:"Planning",LEAVES:"Absences",HR:"Dossiers RH",PAYROLL:"Paie",RECRUITMENT:"Recrutement",TASKS:"Tâches",ANNOUNCEMENTS:"Annonces",CALENDAR:"Calendrier",COMMUNITY:"Communautés RP"} as const;
export type NotificationCategory=keyof typeof notificationCategories;
export const notificationCategoryKeys=Object.keys(notificationCategories) as NotificationCategory[];
export function companyNotificationUrl(companyId:string,view:string){return `/app?${new URLSearchParams({company:companyId,view})}`;}
// Only destinations owned by this application can be emitted or followed.
export function notificationUrl(value:string|null|undefined){
 if(!value)return null;
 if(["/espaces","/candidatures"].includes(value))return value;
 if(/^\/serveurs\/[A-Za-z0-9_-]{1,100}\/acces$/.test(value))return value;
 try{const url=new URL(value,"https://nyro.invalid");if(url.origin!=="https://nyro.invalid"||url.pathname!=="/app"||url.hash||[...url.searchParams.keys()].some(k=>!["company","view"].includes(k)))return null;
 const company=url.searchParams.get("company"),view=url.searchParams.get("view");if(!company||!view||!/^[A-Za-z0-9_-]{1,100}$/.test(company)||!["planning","leaves","reviews","sanctions","payroll","recruitment","tasks","announcements","calendar","employees","messages","equipment"].includes(view))return null;return companyNotificationUrl(company,view);
 }catch{return null;}
}

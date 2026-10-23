import "dotenv/config";
import "./http-slots-flow";
import "./http-logos-flow";
import "./http-theme-flow";
import "./http-documents-flow";
import "./http-notifications-flow";
import "./http-cash-flow";
import "./http-messages-flow";
import "./http-useful-flow";
import "./http-attachments-flow";
import "./http-vercel-transfers-flow";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash,randomBytes, randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { getCookies } from "better-auth/cookies";
import { serializeSignedCookie } from "better-call";
import {execute} from "../src/domains/core/service";
import {docArticles} from "../src/content/docs/registry";

// Distinct test client per run; do not share a throttle bucket between suites.
const ipBytes=randomBytes(2);const clientIp=`198.18.${ipBytes[0]}.${ipBytes[1]}`;
const request=(url:string,init:RequestInit={})=>{const headers=new Headers(init.headers);headers.set("CF-Connecting-IP",clientIp);headers.set("X-Forwarded-For",clientIp);return fetch(url,{...init,headers});};

async function redirectDestination(response: Response, origin: string) {
  const location = response.headers.get("location");
  if (location) return new URL(location, origin);
  // Next.js can begin streaming loading.tsx before the session is resolved.
  // Its documented redirect is then emitted as a refresh meta tag in a 200 page.
  assert.equal(response.status, 200);
  const html = await response.text();
  const destination = html.match(/http-equiv="refresh" content="\d+;url=([^"]+)"/)?.[1];
  assert.ok(destination, "Expected a real HTTP or streaming redirect");
  return new URL(destination.replaceAll("&amp;", "&"), origin);
}

test("HTTP: public homepage, Discord-only sign-in, protected app and tenant guards", async () => {
  const origin = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const email = `http-test-${randomBytes(8).toString("hex")}@example.test`;
  let userId: string | undefined; let companyId: string | undefined;
  const verificationIds:string[]=[];
  const extraUserIds:string[]=[];
  try {
    assert.equal((await request(`${origin}/api/workspace`)).status, 401);
    assert.equal((await request(`${origin}/api/employees?companyId=private&memberId=private`)).status, 401);
    assert.equal((await request(`${origin}/api/finance?companyId=private`)).status,401);
    const privateExport=await request(`${origin}/api/finance/export?companyId=private&format=pdf`);assert.equal(privateExport.status,401,(await privateExport.clone().text()).slice(0,3000));
    const home = await request(origin);
    assert.equal(home.status, 200);
    if (process.env.RPILOT_PRODUCTION_TEST === "true") {
      const workshop = await request(`${origin}/dev/ui`);
      assert.equal(workshop.status, 404);
      assert.ok(!(await workshop.text()).includes("Formulaire et valeurs métier"));
    }
    const html = await home.text();
    assert.match(html, /Commencer avec Discord/); assert.match(html, /id="fonctionnalites"/); assert.match(html, /id="questions"/);
    const protectedPage = await request(`${origin}/app`, { redirect: "manual" });
    assert.equal((await redirectDestination(protectedPage, origin)).pathname, "/login");
    const invitation = await request(`${origin}/app?invite=private-test-token`, { redirect: "manual" });
    assert.equal((await redirectDestination(invitation, origin)).searchParams.get("invite"), "private-test-token");
    const legacy = await request(`${origin}/?invite=legacy-token`, { redirect: "manual" });
    const legacyDestination = await redirectDestination(legacy, origin);
    assert.equal(legacyDestination.pathname, "/app");
    assert.equal(legacyDestination.searchParams.get("invite"), "legacy-token");
    const login = await request(`${origin}/login`);
    const loginHtml = await login.text();
    assert.match(loginHtml, /Continuer avec Discord/); assert.doesNotMatch(loginHtml, /type="password"/);
    const invalidCallback=await request(`${origin}/api/auth/callback/discord?error=access_denied&state=invalid-fixture-state`,{redirect:"manual"});
    assert.equal(invalidCallback.status,302,"An invalid OAuth state must return one redirect, never an internal redirect loop");
    const invalidTarget=new URL(invalidCallback.headers.get("location")!,origin);assert.equal(invalidTarget.origin,origin);assert.equal(invalidTarget.pathname,"/login");assert.ok(invalidTarget.searchParams.get("error"));
    for (const endpoint of ["sign-up/email", "sign-in/email"]) {
      const response = await request(`${origin}/api/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ name: "HTTP Test", email, password: randomBytes(24).toString("hex") }) });
      assert.ok(response.status >= 400 && response.status < 500, `${endpoint} should reject password authentication, got ${response.status}`);
    }
    assert.equal(await db.user.findUnique({ where: { email } }), null);
    const beforeVerification=await db.verification.findMany({select:{id:true}});
    const social=await request(`${origin}/api/auth/sign-in/social`,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify({provider:"discord",callbackURL:`${origin}/app`,disableRedirect:true})});
    assert.equal(social.status,200,await social.clone().text());
    const socialBody=await social.json() as {url:string};const discordUrl=new URL(socialBody.url);assert.equal(discordUrl.hostname,"discord.com");assert.equal(discordUrl.searchParams.get("redirect_uri"),`${origin}/api/auth/callback/discord`);assert.ok(discordUrl.searchParams.get("state"));
    const states=await db.verification.findMany({select:{id:true}});verificationIds.push(...states.filter(v=>!beforeVerification.some(b=>b.id===v.id)).map(v=>v.id));assert.ok(verificationIds.length>0,"OAuth state must persist in PostgreSQL");
    assert.ok(social.headers.get("set-cookie"),"OAuth state cookie must be returned");
    const oauthCookies=social.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
    const cancelledCallback=await request(`${origin}/api/auth/callback/discord?${new URLSearchParams({state:discordUrl.searchParams.get("state")!,error:"access_denied"})}`,{headers:{Cookie:oauthCookies},redirect:"manual"});
    assert.equal(cancelledCallback.status,302);const cancelledTarget=new URL(cancelledCallback.headers.get("location")!,origin);assert.equal(cancelledTarget.pathname,"/login");assert.equal(cancelledTarget.searchParams.get("error"),"access_denied");assert.ok(cancelledCallback.headers.get("set-cookie"),"Consumed OAuth state must expire its cookie");
    const replayedCallback=await request(`${origin}/api/auth/callback/discord?${new URLSearchParams({state:discordUrl.searchParams.get("state")!,error:"access_denied"})}`,{headers:{Cookie:oauthCookies},redirect:"manual"});assert.equal(replayedCallback.status,302);const replayTarget=new URL(replayedCallback.headers.get("location")!,origin);assert.equal(replayTarget.pathname,"/login");assert.notEqual(replayTarget.searchParams.get("error"),"access_denied","Consumed state cannot be reused");
    // Test-only fixture: no application endpoint can create this signed session.
    // This exercises session validation and business flows without pretending to
    // perform Discord's external consent/code exchange.
    const user = await db.user.create({ data: { name: "HTTP Test", email } }); userId = user.id;
    const token = randomBytes(32).toString("hex");
    await db.session.create({ data: { id: randomBytes(16).toString("hex"), userId, token, expiresAt: new Date(Date.now() + 600000) } });
    const cookie = getCookies(auth.options).sessionToken;
    const cookies = (await serializeSignedCookie(cookie.name, token, process.env.BETTER_AUTH_SECRET!, cookie.attributes)).split(";")[0];
    assert.equal((await request(`${origin}/api/workspace`, { headers: { Cookie: `${cookie.name}=invalid` } })).status, 401);
    const headers = { Cookie: cookies, Origin: origin, "Content-Type": "application/json" };
    const create = await request(`${origin}/api/workspace`, { method: "POST", headers, body: JSON.stringify({ action: "company.create", name: "Entreprise HTTP de test", sector: "Garage" }) });
    assert.equal(create.status, 200, await create.clone().text()); companyId = (await create.json()).data.id;
    const workspace = await request(`${origin}/api/workspace?companyId=${companyId}`, { headers });
    assert.equal(workspace.status, 200); const data = await workspace.json();
    assert.equal(data.current.company.name, "Entreprise HTTP de test"); assert.equal(data.current.balance, 0); assert.equal(data.current.sales.length, 0); assert.equal(data.current.stats.revenue, 0); assert.equal(data.current.stats.expenses, 0);
    assert.equal((await request(`${origin}/api/workspace?companyId=another-tenant`, { headers })).status, 403);
    assert.equal((await request(`${origin}/api/workspace`, { method: "POST", headers: { ...headers, Origin: "https://foreign.example.test" }, body: JSON.stringify({ action: "task.create", companyId, title: "Forbidden", priority: "NORMAL" }) })).status, 403);
    assert.equal((await request(`${origin}/api/workspace`, { method: "POST", headers, body: "invalid json" })).status, 400);
    assert.equal((await request(`${origin}/api/workspace`, { method: "POST", headers, body: "null" })).status, 400);
    const task = await request(`${origin}/api/workspace`, { method: "POST", headers, body: JSON.stringify({ action: "task.create", companyId, title: "Persistent HTTP task", priority: "HIGH" }) });
    assert.equal(task.status, 200);
    assert.equal(await db.task.count({ where: { companyId, title: "Persistent HTTP task" } }), 1);
    const post = async (payload: Record<string, unknown>) => {
      const response = await request(`${origin}/api/workspace`, { method: "POST", headers, body: JSON.stringify({ companyId, ...payload }) });
      assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).data;
    };
    const customer = await post({ action: "customer.save", name: "Client HTTP RP", notes: "Note interne de test" });
    await post({ action: "employee.profile", memberId: data.current.memberId, characterName: "Personnage HTTP", jobTitle: "Direction de contrôle", phone: "555-0100", biography: "Présentation privée RH HTTP" });
    await post({ action: "employee.event", memberId: data.current.memberId, kind: "NOTE", title: "Suivi privé", content: "Note privée RH HTTP" });
    const dossierResponse = await request(`${origin}/api/employees?companyId=${companyId}&memberId=${data.current.memberId}`, { headers });
    assert.equal(dossierResponse.status, 200); assert.match(dossierResponse.headers.get("cache-control") || "", /no-store/);
    const dossier = await dossierResponse.json();
    assert.equal(dossier.target.characterName, "Personnage HTTP");
    assert.equal(dossier.target.profile.jobTitle, "Direction de contrôle");
    assert.ok(dossier.events.some((e: {content:string}) => e.content === "Note privée RH HTTP"));
    assert.equal((await request(`${origin}/api/employees?companyId=another-tenant&memberId=${data.current.memberId}`, { headers })).status, 403);
    assert.equal((await request(`${origin}/api/employees?companyId=${companyId}&memberId=another-member`, { headers })).status, 404);
    const currentWorkspace = await (await request(`${origin}/api/workspace?companyId=${companyId}`, { headers })).text();
    assert.ok(!currentWorkspace.includes("Note privée RH HTTP")); assert.ok(!currentWorkspace.includes("Présentation privée RH HTTP"));
    const grade = await post({ action: "role.create", name: "Grade HTTP", permissions: ["dashboard.read"] });
    await post({ action: "role.reorder", roleIds: [grade.id, ...data.current.roles.filter((r: {isOwner:boolean}) => !r.isOwner).map((r: {id:string}) => r.id)] });
    await post({ action: "role.delete", roleId: grade.id, reason: "Fin de contrôle HTTP" });
    assert.equal(await db.companyRole.findUnique({ where: {id:grade.id} }), null);
    const invoice = await post({ action: "billing.save", kind: "INVOICE", customerId: customer.id, items: [{ label: "Prestation HTTP", quantity: 2, unitPrice: 12345 }] });
    const print = await request(`${origin}/app/billing/${invoice.id}`, { headers });
    assert.equal(print.status, 200); const printHtml = await print.text();
    assert.match(printHtml, new RegExp(invoice.number)); assert.match(printHtml, /Client HTTP RP/); assert.match(printHtml, /Prestation HTTP/);
    assert.ok(!printHtml.includes(token)); assert.ok(!printHtml.includes("Note interne de test"));
    const privatePrint = await request(`${origin}/app/billing/${invoice.id}`, { redirect: "manual" });
    assert.equal((await redirectDestination(privatePrint, origin)).pathname, "/login");
    await post({ action: "billing.transition", documentId: invoice.id, status: "ISSUED" });
    await post({ action: "billing.transition", documentId: invoice.id, status: "PAID" });
    assert.equal((await db.financialEntry.aggregate({ where: { companyId }, _sum: { amount: true } }))._sum.amount, 24690);
    await post({ action: "module.toggle", key: "invoices", enabled: false });
    const hiddenPrint = await request(`${origin}/app/billing/${invoice.id}`, { headers });
    assert.ok([200, 404].includes(hiddenPrint.status)); assert.ok(!(await hiddenPrint.text()).includes(invoice.number));
    assert.equal(await db.billingDocument.count({ where: { companyId } }), 1);
    const bank=await post({action:"finance.account.save",name:"Compte HTTP RP",type:"BANK",isDefault:true});
    const receipt=await post({action:"finance.operation.create",kind:"INCOME",amount:50,label:"=Recette HTTP protégée",requestKey:randomUUID(),accountId:bank.id,occurredAt:"2026-01-03T12:00:00Z"});
    await post({action:"finance.operation.post",operationId:receipt.id});
    await post({action:"finance.operation.reverse",operationId:receipt.id,requestKey:randomUUID(),reason:"Correction HTTP contrôlée"});
    const reconciliation=await post({action:"finance.reconcile",accountId:bank.id,requestKey:randomUUID(),asOf:"2026-01-03",observed:50,note:"Contrôle HTTP du solde"});assert.ok(reconciliation.id);
    await db.financialEntry.createMany({data:Array.from({length:35},(_,i)=>({companyId:companyId!,kind:"MANUAL_INCOME",label:`Export HTTP complet ${i}`,amount:1,sourceId:randomUUID(),actorId:userId!,accountId:bank.id}))});
    const finance=await request(`${origin}/api/finance?companyId=${companyId}&pageSize=25`,{headers});assert.equal(finance.status,200);assert.match(finance.headers.get("cache-control")||"",/no-store/);
    const financeData=await finance.json();assert.equal(financeData.total,38);assert.equal(financeData.rows.length,25);assert.equal(financeData.reconciliations.length,1);
    assert.equal((await request(`${origin}/api/finance?companyId=another-tenant`,{headers})).status,403);
    assert.equal((await request(`${origin}/api/finance?companyId=${companyId}&from=invalid`,{headers})).status,400);
    const csv=await request(`${origin}/api/finance/export?companyId=${companyId}&format=csv&pageSize=1`,{headers});assert.equal(csv.status,200);const csvBody=await csv.text();assert.equal(csvBody.split("\r\n").length,39);assert.match(csvBody,/"'=Recette HTTP protégée"/);assert.match(csvBody,/"-50"/);assert.match(csvBody,/Export HTTP complet 34/);
    const pdf=await request(`${origin}/api/finance/export?companyId=${companyId}&format=pdf&q=Export%20HTTP`,{headers});assert.equal(pdf.status,200);assert.equal(pdf.headers.get("content-type"),"application/pdf");const pdfBytes=Buffer.from(await pdf.arrayBuffer());assert.equal(pdfBytes.subarray(0,4).toString(),"%PDF");if(process.env.RPILOT_WORKER_TEST==="true"){const fs=await import("node:fs/promises");await fs.mkdir(".local/qa",{recursive:true});await fs.writeFile(".local/qa/finance-worker-report.pdf",pdfBytes);}
    assert.equal((await request(`${origin}/api/inventory?companyId=${companyId}`)).status,401);
    const stockProduct=await post({action:"product.create",name:"Pièce HTTP",sku:"HTTP-STOCK",category:"Pièces",price:200,cost:100,stock:0,threshold:2,trackStock:true});
    const stockPayload={action:"stock.move",requestKey:randomUUID(),productId:stockProduct.id,kind:"INITIAL",quantity:4,reason:"Stock initial HTTP",occurredAt:"2026-01-03T12:00:00Z"};
    await post(stockPayload);await post(stockPayload);
    const inventory=await post({action:"stock.count.create",requestKey:randomUUID(),label:"Inventaire HTTP",productIds:[stockProduct.id]});
    await post({action:"stock.count.update",batchId:inventory.id,revision:0,lines:[{productId:stockProduct.id,counted:3,reason:"Écart physique HTTP"}]});await post({action:"stock.count.post",batchId:inventory.id,revision:1});
    const stockState=await request(`${origin}/api/inventory?companyId=${companyId}&batchId=${inventory.id}`,{headers});assert.equal(stockState.status,200);const stockData=await stockState.json();assert.equal(stockData.products.find((p:{id:string})=>p.id===stockProduct.id).stock,3);assert.equal(stockData.selected.status,"POSTED");
    const supplier=await post({action:"supplier.save",name:"Fournisseur HTTP"});
    const order=await post({action:"purchase.save",supplierId:supplier.id,items:[{productId:stockProduct.id,quantity:4,unitCost:101}]});
    await post({action:"purchase.transition",orderId:order.id,status:"ORDERED"});
    const item=await db.purchaseItem.findFirstOrThrow({where:{orderId:order.id}});
    const delivery={action:"purchase.receive",orderId:order.id,requestKey:randomUUID(),occurredAt:"2026-01-04T12:00:00Z",reference:"BL-HTTP",items:[{itemId:item.id,quantity:2}]};
    await post(delivery);await post(delivery);
    assert.equal((await db.purchaseOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PARTIAL");assert.equal((await db.product.findUniqueOrThrow({where:{id:stockProduct.id}})).stock,5);
    const receiptUrl=`${origin}/api/purchases/${order.id}/receipts?companyId=${companyId}`;
    assert.equal((await request(receiptUrl)).status,401);
    const receipts=await request(receiptUrl,{headers});assert.equal(receipts.status,200);assert.match(receipts.headers.get("cache-control")||"",/no-store/);const receiptData=await receipts.json();assert.equal(receiptData.count,1);assert.equal(receiptData.receipts[0].total,202);assert.equal(receiptData.receipts[0].lines[0].quantity,2);assert.equal(receiptData.receipts[0].reference,"BL-HTTP");
    assert.equal((await request(`${origin}/api/purchases/${order.id}/receipts?companyId=foreign`,{headers})).status,403);
    assert.equal((await request(`${receiptUrl}&page=0`,{headers})).status,400);
    const warehouse=await post({action:"stock.warehouse.save",code:"HTTP",name:"Réserve HTTP"});
    const transfer={action:"stock.transfer",productId:stockProduct.id,sourceWarehouseId:null,destinationWarehouseId:warehouse.id,quantity:2,reason:"Rangement HTTP",requestKey:randomUUID(),occurredAt:"2026-01-04T12:00:00Z"};await post(transfer);await post(transfer);
    const warehouseUrl=`${origin}/api/inventory/warehouses?companyId=${companyId}&warehouseId=${warehouse.id}`;
    assert.equal((await request(warehouseUrl)).status,401);const warehouseResponse=await request(warehouseUrl,{headers});assert.equal(warehouseResponse.status,200);assert.match(warehouseResponse.headers.get("cache-control")||"",/no-store/);const warehouseData=await warehouseResponse.json();assert.equal(warehouseData.products[0].quantity,2);assert.equal(warehouseData.transferCount,1);
    assert.equal((await request(`${origin}/api/inventory/warehouses?companyId=foreign`,{headers})).status,403);
    assert.equal((await request(`${warehouseUrl}&page=0`,{headers})).status,400);
    const started=await post({action:"time.start",requestKey:randomUUID()});const paused=await post({action:"time.pause",entryId:started.id,revision:started.revision,paused:true,requestKey:randomUUID()});const stopped=await post({action:"time.stop",entryId:started.id,revision:paused.revision,requestKey:randomUUID()});
    const correction={action:"time.correct",entryId:started.id,revision:stopped.revision,start:"2026-01-04T08:00:00Z",end:"2026-01-04T09:00:00Z",pauseMinutes:5,reason:"Correction contrôlée HTTP",requestKey:randomUUID()};const corrected=await post(correction);await post(correction);
    const ownReview=await request(`${origin}/api/workspace`,{method:"POST",headers,body:JSON.stringify({companyId,action:"time.review",entryId:started.id,revision:corrected.revision,status:"APPROVED",reason:"Auto validation refusée",requestKey:randomUUID()})});assert.equal(ownReview.status,403);
    const employeeUser=await db.user.create({data:{name:"Employé contrôle HTTP",email:`review-${email}`}});extraUserIds.push(employeeUser.id);
    const employeeRole=await db.companyRole.findFirstOrThrow({where:{companyId,isOwner:false}});const employeeMember=await db.companyMember.create({data:{companyId:companyId!,userId:employeeUser.id,roleId:employeeRole.id,characterName:"Employé HTTP heures"}});
    const employeeTime=await db.timeEntry.create({data:{companyId:companyId!,memberId:employeeMember.id,start:new Date("2026-01-04T08:00:00Z"),end:new Date("2026-01-04T09:00:00Z")}});
    await post({action:"time.review",entryId:employeeTime.id,revision:0,status:"APPROVED",reason:"Contrôle des heures HTTP",requestKey:randomUUID()});
    const timeUrl=`${origin}/api/time?companyId=${companyId}&from=2026-01-04&to=2026-01-04`;
    assert.equal((await request(timeUrl)).status,401);const timeResponse=await request(timeUrl,{headers});assert.equal(timeResponse.status,200);assert.match(timeResponse.headers.get("cache-control")||"",/no-store/);const timeData=await timeResponse.json();assert.equal(timeData.summary.minutes,115);assert.equal(timeData.summary.approvedMinutes,60);assert.equal(timeData.active,null);
    assert.equal((await request(`${origin}/api/time?companyId=foreign`,{headers})).status,403);assert.equal((await request(`${timeUrl}&page=0`,{headers})).status,400);
    // Period APIs must read the database rather than the capped workspace payload.
    const repeated=await post({action:"shift.repeat",requestKey:randomUUID(),memberId:employeeMember.id,title:"Service HTTP récurrent",start:"2027-06-01T08:00:00Z",end:"2027-06-01T10:00:00Z",occurrences:2,intervalWeeks:1});
    const planningUrl=`${origin}/api/planning?companyId=${companyId}&from=2027-06-01T00:00:00Z&to=2027-06-15T00:00:00Z`;
    assert.equal((await request(planningUrl)).status,401);const planned=await request(planningUrl,{headers});assert.equal(planned.status,200);assert.equal((await planned.json()).shifts.length,2);
    await post({action:"shift.series.cancel",requestKey:randomUUID(),seriesId:repeated.id,from:"2027-06-01T00:00:00Z",reason:"Annulation HTTP motivée"});assert.equal((await (await request(planningUrl,{headers})).json()).shifts.length,0);
    await post({action:"availability.save",requestKey:randomUUID(),memberId:employeeMember.id,start:"2027-06-02T08:00:00Z",end:"2027-06-02T10:00:00Z",kind:"UNAVAILABLE",notes:"Indisponibilité privée HTTP"});
    assert.equal((await (await request(planningUrl,{headers})).json()).availabilities.length,1);
    const leaveType=await post({action:"leave.type.save",requestKey:randomUUID(),code:"HTTP",name:"Congé HTTP"});
    const employeeToken=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:employeeUser.id,token:employeeToken,expiresAt:new Date(Date.now()+600000)}});
    const employeeCookies=(await serializeSignedCookie(cookie.name,employeeToken,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0];
    const employeeHeaders={...headers,Cookie:employeeCookies};
    // Payroll uses the same authenticated API, approved pointage and RP ledger.
    assert.equal((await request(`${origin}/api/payroll?companyId=${companyId}`)).status,401);
    assert.equal((await request(`${origin}/api/payroll/pdf?companyId=${companyId}&slipId=private`)).status,401);
    assert.equal((await request(`${origin}/api/payroll?companyId=foreign`,{headers})).status,403);
    assert.equal((await request(`${origin}/api/payroll?companyId=${companyId}&page=0`,{headers})).status,400);
    await post({action:"payroll.policy",target:"MEMBER",targetId:employeeMember.id,mode:"HOURLY",rate:60,regularMinutes:120,overtimeBps:12500,commissionBps:0,requestKey:randomUUID()});
    const payRun=await post({action:"payroll.run",label:"Paie HTTP janvier",from:"2026-01-01",to:"2026-01-07",requestKey:randomUUID()});
    const paySlip=await post({action:"payroll.prepare",runId:payRun.id,memberId:employeeMember.id,bonus:0,deduction:0,note:"Bulletin HTTP contrôlé",requestKey:randomUUID()});
    const payrollUrl=`${origin}/api/payroll?companyId=${companyId}&slipId=${paySlip.id}`;
    assert.equal((await request(payrollUrl,{headers:employeeHeaders})).status,404);
    const payRead=await request(payrollUrl,{headers});assert.equal(payRead.status,200);assert.match(payRead.headers.get("cache-control")||"",/no-store/);assert.equal((await payRead.json()).selected.total,60);
    const payApproved=await post({action:"payroll.review",slipId:paySlip.id,revision:paySlip.revision,decision:"APPROVE",reason:"Bulletin HTTP validé",requestKey:randomUUID()});
    const payFunds=await post({action:"finance.operation.create",kind:"INCOME",amount:10000,label:"Fonds paie HTTP RP",accountId:bank.id,occurredAt:"2026-01-01T12:00:00Z",requestKey:randomUUID()});await post({action:"finance.operation.post",operationId:payFunds.id});
    const payCommand={action:"payroll.pay",slipId:paySlip.id,revision:payApproved.revision,accountId:bank.id,requestKey:randomUUID()};await post(payCommand);await post(payCommand);
    assert.equal(await db.financialEntry.count({where:{companyId,kind:"PAYROLL",sourceId:paySlip.id}}),1);
    const paidRead=await request(payrollUrl,{headers:employeeHeaders});assert.equal(paidRead.status,200);assert.equal((await paidRead.json()).selected.status,"PAID");
    const payPdf=await request(`${origin}/api/payroll/pdf?companyId=${companyId}&slipId=${paySlip.id}`,{headers:employeeHeaders});assert.equal(payPdf.status,200);assert.equal(payPdf.headers.get("content-type"),"application/pdf");const payPdfBytes=Buffer.from(await payPdf.arrayBuffer());assert.equal(payPdfBytes.subarray(0,4).toString(),"%PDF");
    if(process.env.RPILOT_WORKER_TEST==="true"){const fs=await import("node:fs/promises");await fs.mkdir(".local/qa",{recursive:true});await fs.writeFile(".local/qa/payroll-worker-report.pdf",payPdfBytes);}
    const leaveResponse=await request(`${origin}/api/workspace`,{method:"POST",headers:employeeHeaders,body:JSON.stringify({companyId,action:"leave.create",typeId:leaveType.id,requestKey:randomUUID(),start:"2027-06-03T08:00:00Z",end:"2027-06-03T10:00:00Z",reason:"Motif privé HTTP"})});assert.equal(leaveResponse.status,200,await leaveResponse.clone().text());const leave=(await leaveResponse.json()).data;
    const conflictedShift=await post({action:"shift.create",memberId:employeeMember.id,title:"Conflit congé HTTP",start:"2027-06-03T09:00:00Z",end:"2027-06-03T11:00:00Z"});
    const pendingLeaves=await request(`${origin}/api/leaves?companyId=${companyId}&status=PENDING`,{headers:employeeHeaders});assert.equal(pendingLeaves.status,200);assert.equal((await pendingLeaves.json()).rows[0].conflicts,1);
    await post({action:"leave.decide",requestKey:randomUUID(),leaveId:leave.id,revision:0,approve:true,reason:"Accord HTTP",cancelConflictingShifts:true});assert.equal((await db.shift.findUniqueOrThrow({where:{id:conflictedShift.id}})).status,"CANCELLED");
    const leavesResponse=await request(`${origin}/api/leaves?companyId=${companyId}&view=calendar&from=2027-06-01&to=2027-06-30`,{headers:employeeHeaders});assert.equal(leavesResponse.status,200);assert.equal((await leavesResponse.json()).rows[0].status,"APPROVED");
    const candidate=await db.user.create({data:{name:"Candidat HTTP",email:`candidate-${email}`}});extraUserIds.push(candidate.id);
    const candidateToken=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId:candidate.id,token:candidateToken,expiresAt:new Date(Date.now()+600000)}});
    const candidateCookies=(await serializeSignedCookie(cookie.name,candidateToken,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0];const candidateHeaders={...headers,Cookie:candidateCookies};
    const candidatePost=async(payload:Record<string,unknown>)=>{const response=await request(`${origin}/api/workspace`,{method:"POST",headers:candidateHeaders,body:JSON.stringify(payload)});assert.equal(response.status,200,await response.clone().text());return (await response.json()).data;};
    const job=await post({action:"recruitment.job.save",requestKey:randomUUID(),title:"Poste HTTP RP",description:"Une offre RP réelle de test isolé pour valider le parcours.",contractType:"OTHER",positions:1,status:"PUBLISHED"});
    assert.equal((await request(`${origin}/recrutement`)).status,200);assert.equal((await request(`${origin}/recrutement/${job.id}`)).status,200);
    const protectedCandidate=await redirectDestination(await request(`${origin}/candidatures`,{redirect:"manual"}),origin);assert.equal(protectedCandidate.searchParams.get("returnTo"),"/candidatures");
    const publicDetail=await request(`${origin}/api/recruitment/public/${job.id}`);assert.equal(publicDetail.status,200);assert.equal((await publicDetail.json()).job.remaining,1);
    const application=await candidatePost({action:"recruitment.apply",requestKey:randomUUID(),jobId:job.id,characterName:"Candidat RP HTTP",motivation:"Je souhaite intégrer cette entreprise RP de test."});
    await post({action:"recruitment.note",requestKey:randomUUID(),applicationId:application.id,content:"Note interne secrète HTTP"});
    const mine=await request(`${origin}/api/recruitment/mine`,{headers:candidateHeaders});assert.equal(mine.status,200);assert.ok(!(await mine.text()).includes("Note interne secrète HTTP"));assert.equal((await (await request(`${origin}/api/recruitment/mine`,{headers:employeeHeaders})).json()).total,0);
    assert.equal((await request(`${origin}/api/recruitment?companyId=${companyId}`,{headers:candidateHeaders})).status,403);
    const proposal=await post({action:"recruitment.offer",requestKey:randomUUID(),applicationId:application.id,revision:0,roleId:employeeRole.id,department:"Atelier",salary:10000,message:"Proposition HTTP RP"});assert.equal(await db.companyMember.count({where:{companyId,userId:candidate.id}}),0);
    const acceptance={action:"recruitment.accept",requestKey:randomUUID(),applicationId:application.id,revision:proposal.revision};await candidatePost(acceptance);await candidatePost(acceptance);assert.equal(await db.companyMember.count({where:{companyId,userId:candidate.id}}),1);assert.equal((await db.jobApplication.findUniqueOrThrow({where:{id:application.id}})).status,"HIRED");
    assert.equal((await request(`${origin}/api/recruitment/public/${job.id}`)).status,404);assert.equal((await request(`${origin}/candidatures`,{headers:candidateHeaders})).status,200);
    await db.inventoryMovement.createMany({data:Array.from({length:35},(_,i)=>({companyId:companyId!,productId:stockProduct.id,quantity:1,kind:"IN",reason:`Export stock HTTP ${i}`,actorId:userId!,occurredAt:new Date("2026-01-04T12:00:00Z")}))});await db.product.update({where:{id:stockProduct.id},data:{stock:{increment:35},stockRevision:{increment:35}}});
    const stockCsv=await request(`${origin}/api/inventory/export?companyId=${companyId}&view=movements&q=Export%20stock%20HTTP`,{headers});assert.equal(stockCsv.status,200);assert.equal((await stockCsv.text()).split("\r\n").length,36);
    const productsCsv=await request(`${origin}/api/inventory/export?companyId=${companyId}&view=products`,{headers});assert.equal(productsCsv.status,200);assert.match(await productsCsv.text(),/"HTTP-STOCK";"Pièce HTTP";"Pièces";"40";"2";"100";"4000"/);
    const lowCsv=await request(`${origin}/api/inventory/export?companyId=${companyId}&view=products&low=true`,{headers});assert.equal(lowCsv.status,200);assert.equal((await lowCsv.text()).split("\r\n").length,1);
    const stockPdfUrl=`${origin}/api/inventory/export?companyId=${companyId}&view=movements&format=pdf&q=Export%20stock%20HTTP&page=2`;
    assert.equal((await request(stockPdfUrl)).status,401);
    assert.equal((await request(`${origin}/api/inventory/export?companyId=${companyId}&view=products&format=invalid`,{headers})).status,400);
    const stockPdf=await request(stockPdfUrl,{headers});assert.equal(stockPdf.status,200);assert.equal(stockPdf.headers.get("content-type"),"application/pdf");assert.match(stockPdf.headers.get("cache-control")||"",/no-store/);const stockPdfBytes=Buffer.from(await stockPdf.arrayBuffer());assert.equal(stockPdfBytes.subarray(0,4).toString(),"%PDF");
    const productPdf=await request(`${origin}/api/inventory/export?companyId=${companyId}&view=products&format=pdf`,{headers});assert.equal(productPdf.status,200);const productPdfBytes=Buffer.from(await productPdf.arrayBuffer());assert.equal(productPdfBytes.subarray(0,4).toString(),"%PDF");
    if(process.env.RPILOT_WORKER_TEST==="true"){const fs=await import("node:fs/promises");await fs.writeFile(".local/qa/stock-worker-report.pdf",stockPdfBytes);await fs.writeFile(".local/qa/stock-products-worker-report.pdf",productPdfBytes);}
    await db.inventoryMovement.createMany({data:Array.from({length:1001},(_,i)=>({companyId:companyId!,productId:stockProduct.id,quantity:1,kind:"IN",reason:`Limite PDF HTTP ${i}`,actorId:userId!,occurredAt:new Date("2026-01-04T12:00:00Z")}))});await db.product.update({where:{id:stockProduct.id},data:{stock:{increment:1001},stockRevision:{increment:1001}}});
    assert.equal((await request(`${origin}/api/inventory/export?companyId=${companyId}&view=movements&format=pdf&q=Limite%20PDF%20HTTP`,{headers})).status,413);
    await db.timeEntry.createMany({data:Array.from({length:26},(_,i)=>({companyId:companyId!,memberId:employeeMember.id,start:new Date(Date.UTC(2026,2,i+1,8)),end:new Date(Date.UTC(2026,2,i+1,9))}))});
    const timeExport=`${origin}/api/time/export?companyId=${companyId}&from=2026-03-01&to=2026-03-31&page=2`;
    assert.equal((await request(timeExport)).status,401);assert.equal((await request(`${timeExport}&format=invalid`,{headers})).status,400);
    const timeCsv=await request(timeExport,{headers:employeeHeaders});assert.equal(timeCsv.status,200);assert.match(timeCsv.headers.get("cache-control")||"",/no-store/);assert.equal((await timeCsv.text()).split("\r\n").length,27);
    const timePdf=await request(`${timeExport}&format=pdf`,{headers});assert.equal(timePdf.status,200);const timePdfBytes=Buffer.from(await timePdf.arrayBuffer());assert.equal(timePdfBytes.subarray(0,4).toString(),"%PDF");
    if(process.env.RPILOT_WORKER_TEST==="true"){const fs=await import("node:fs/promises");await fs.writeFile(".local/qa/time-worker-report.pdf",timePdfBytes);}
    const logout = await request(`${origin}/api/auth/sign-out`, { method: "POST", headers, body: "{}" });
    assert.equal(logout.status, 200);
    assert.equal((await request(`${origin}/api/workspace`, { headers: { Cookie: cookies } })).status, 401);
    let throttled=false;
    for(let i=0;i<32;i++){const response=await request(`${origin}/api/auth/sign-in/social`,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify({provider:"unknown-test-provider",callbackURL:`${origin}/app`})});assert.notEqual(response.status,500);if(response.status===429){throttled=true;break;}}
    assert.ok(throttled,"Database-backed auth rate limiting must return HTTP 429");
    assert.ok(await db.rateLimit.count(),"Auth rate limits must persist in PostgreSQL");
  } finally {
    if(verificationIds.length)await db.verification.deleteMany({where:{id:{in:verificationIds}}});
    if(companyId){await db.payrollSlip.deleteMany({where:{companyId}});await db.payrollPolicy.deleteMany({where:{companyId}});}
    if (companyId) {await db.recruitmentJob.deleteMany({where:{companyId}});await db.memberAvailability.deleteMany({where:{companyId}});await db.shift.deleteMany({where:{companyId}});await db.leaveRequest.deleteMany({where:{companyId}});await db.purchaseReceipt.deleteMany({where:{companyId}});await db.purchaseOrder.deleteMany({where:{companyId}});await db.inventoryMovement.deleteMany({where:{companyId}});await db.stockBatch.deleteMany({where:{companyId}});await db.warehouseStock.deleteMany({where:{companyId}});await db.stockWarehouse.deleteMany({where:{companyId}});await db.timeEntry.deleteMany({where:{companyId}});await db.financialEntry.deleteMany({where:{companyId}});await db.financeOperation.deleteMany({where:{companyId}});await db.financeReconciliation.deleteMany({where:{companyId}});await db.billingDocument.deleteMany({ where: { companyId } }); await db.companyMember.deleteMany({ where: { companyId } }); await db.company.delete({ where: { id: companyId } }); }
    if(extraUserIds.length)await db.user.deleteMany({where:{id:{in:extraUserIds}}});
    if (userId) { await db.user.delete({ where: { id: userId } }); await db.rateLimit.deleteMany({ where: { key: { startsWith: `app:${userId}:` } } }); }
    await db.$disconnect();
  }
});

test("HTTP: evaluations and sanctions stay private and preserve published decisions",async()=>{
  const origin=process.env.BETTER_AUTH_URL||"http://localhost:3000",suffix=randomUUID(),users:string[]=[];let companyId="";
  try{
    const owner=await db.user.create({data:{name:"Direction RH HTTP",email:`people-owner-${suffix}@example.test`}});users.push(owner.id);
    const employee=await db.user.create({data:{name:"Employé RH HTTP",email:`people-staff-${suffix}@example.test`}});users.push(employee.id);
    companyId=(await execute(owner,undefined,{action:"company.create",name:`RH HTTP ${suffix}`,sector:"Services"}) as {id:string}).id;
    const role=await db.companyRole.findFirstOrThrow({where:{companyId,isOwner:false}});
    const member=await db.companyMember.create({data:{companyId,userId:employee.id,roleId:role.id,characterName:"Alex RH HTTP"}});
    const signedHeaders=async(userId:string)=>{
      const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId,token,expiresAt:new Date(Date.now()+600000)}});
      const cookie=getCookies(auth.options).sessionToken;
      return {Cookie:(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0],Origin:origin,"Content-Type":"application/json"};
    };
    const headers=await signedHeaders(owner.id),staffHeaders=await signedHeaders(employee.id);
    const post=async(input:Record<string,unknown>,h=headers)=>{const response=await request(`${origin}/api/workspace`,{method:"POST",headers:h,body:JSON.stringify({companyId,kind:"REVIEW",requestKey:randomUUID(),...input})});assert.equal(response.status,200,await response.clone().text());return (await response.json()).data as {id:string;revision:number};};
    const read=(extra:Record<string,string>={},h=headers)=>request(`${origin}/api/people?${new URLSearchParams({companyId,kind:"REVIEW",...extra})}`,{headers:h});
    assert.equal((await request(`${origin}/api/people?companyId=${companyId}&kind=REVIEW`)).status,401);
    assert.equal((await read({companyId:"foreign"})).status,403);assert.equal((await read({page:"0"})).status,400);assert.equal((await read({view:"templates"},staffHeaders)).status,403);
    const secret="Note confidentielle RH HTTP à ne jamais diffuser";
    const template=await post({action:"hr.template.save",name:"Évaluation HTTP",instructions:secret,criteria:[{label:"Qualité",weight:1}]});
    const campaign=await post({action:"hr.campaign.save",templateId:template.id,name:"Campagne HTTP",from:"2026-01-01",to:"2026-01-31"});
    const campaignRead=await read({campaignId:campaign.id});assert.equal(campaignRead.status,200);const campaignData=await campaignRead.json();const criterion=campaignData.choiceCampaign.criteria[0];
    const draft=await post({action:"hr.record.save",memberId:member.id,campaignId:campaign.id,title:"Entretien HTTP",occurredAt:"2026-01-15T12:00:00Z",content:"Commentaires RP HTTP",conclusion:"Progression à poursuivre",privateNote:secret,scores:[{key:criterion.key,score:4,comment:"Critère RP contrôlé"}],goals:[{title:"Terminer la formation RP",due:"2026-02-01"}]});
    assert.equal((await read({recordId:draft.id},staffHeaders)).status,404);
    const publishPayload={action:"hr.record.transition",id:draft.id,revision:draft.revision,decision:"PUBLISH",reason:"Entretien HTTP contrôlé",requestKey:randomUUID()};
    const published=await post(publishPayload);await post(publishPayload);
    const personalRead=await read({recordId:draft.id},staffHeaders);assert.equal(personalRead.status,200);assert.match(personalRead.headers.get("cache-control")||"",/no-store/);const personal=await personalRead.json();assert.equal(personal.selected.scoreBps,8000);assert.ok(!JSON.stringify(personal).includes(secret));assert.ok(!("privateNote" in personal.selected));assert.ok(personal.events.every((e:{action:string})=>e.action!=="CREATE"));
    const acknowledged=await post({action:"hr.record.ack",id:draft.id,revision:published.revision,comment:"Dossier RP lu"},staffHeaders);
    const goal=personal.selected.goals[0];const tracked=await post({action:"hr.goal",id:draft.id,revision:acknowledged.revision,goalKey:goal.key,status:"DONE",note:"Formation terminée et contrôlée"});
    assert.equal((await (await read({recordId:draft.id},staffHeaders)).json()).selected.goals[0].status,"DONE");
    const archived=await post({action:"hr.record.transition",id:draft.id,revision:tracked.revision,decision:"ARCHIVE",reason:"Campagne archivée"});
    assert.equal((await (await read({recordId:draft.id},staffHeaders)).json()).selected.status,"ARCHIVED");
    assert.ok(archived.revision>tracked.revision);
    const dossier=await request(`${origin}/api/employees?${new URLSearchParams({companyId,memberId:member.id})}`,{headers:staffHeaders});assert.equal(dossier.status,200);const dossierBody=await dossier.json();assert.equal(dossierBody.permissions.reviews,true);assert.equal(dossierBody.permissions.sanctions,true);assert.ok(!JSON.stringify(dossierBody).includes(secret));
    const type=await post({action:"hr.template.save",kind:"SANCTION",name:"Avertissement HTTP RP",instructions:"Interne",criteria:[]});
    const sanction=await post({action:"hr.record.save",kind:"SANCTION",memberId:member.id,templateId:type.id,title:"Décision RP HTTP",occurredAt:"2026-01-16T12:00:00Z",content:"Faits RP HTTP",conclusion:"Avertissement RP consigné",privateNote:secret,scores:[],goals:[]});
    const before=await db.companyMember.findUniqueOrThrow({where:{id:member.id}});
    const issued=await post({action:"hr.record.transition",kind:"SANCTION",id:sanction.id,revision:0,decision:"PUBLISH",reason:"Décision communiquée"});
    const notified=await read({kind:"SANCTION",recordId:sanction.id},staffHeaders);assert.equal(notified.status,200);assert.ok(!(await notified.text()).includes(secret));
    await post({action:"hr.record.transition",kind:"SANCTION",id:sanction.id,revision:issued.revision,decision:"REVOKE",reason:"Décision révoquée après réexamen"});
    assert.equal((await (await read({kind:"SANCTION",recordId:sanction.id},staffHeaders)).json()).selected.status,"REVOKED");assert.deepEqual(await db.companyMember.findUniqueOrThrow({where:{id:member.id}}),before);
    await post({action:"module.toggle",key:"sanctions",enabled:false});assert.equal((await read({kind:"SANCTION"},staffHeaders)).status,403);
    const workspace=await request(`${origin}/api/workspace?companyId=${companyId}`,{headers});assert.ok(!(await workspace.text()).includes(secret));
    const html=await (await request(`${origin}/app?company=${companyId}`,{headers})).text();assert.match(html,/Évaluations/);assert.ok(!html.includes(secret));
  }finally{
    if(companyId){await db.hrRecord.deleteMany({where:{companyId}});await db.hrCampaign.deleteMany({where:{companyId}});await db.hrTemplate.deleteMany({where:{companyId}});await db.company.delete({where:{id:companyId}});}
    await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();
  }
});


test("HTTP: tasks persist assignments, checklist completion, comments and archived history",async()=>{
  const origin=process.env.BETTER_AUTH_URL||"http://localhost:3000",suffix=randomUUID(),users:string[]=[];let companyId="";
  try{
    const owner=await db.user.create({data:{name:"Direction tâches HTTP",email:`tasks-owner-${suffix}@example.test`}});users.push(owner.id);
    const staff=await db.user.create({data:{name:"Employé tâches HTTP",email:`tasks-staff-${suffix}@example.test`}});users.push(staff.id);
    companyId=(await execute(owner,undefined,{action:"company.create",name:`Tâches HTTP ${suffix}`,sector:"Garage"}) as {id:string}).id;
    const role=await db.companyRole.findFirstOrThrow({where:{companyId,isOwner:false}});
    const member=await db.companyMember.create({data:{companyId,userId:staff.id,roleId:role.id,characterName:"Employé tâches RP"}});
    const signedHeaders=async(userId:string)=>{const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId,token,expiresAt:new Date(Date.now()+600000)}});const cookie=getCookies(auth.options).sessionToken;return {Cookie:(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0],Origin:origin,"Content-Type":"application/json"};};
    const headers=await signedHeaders(owner.id),staffHeaders=await signedHeaders(staff.id);
    const send=(payload:Record<string,unknown>,h=headers)=>request(`${origin}/api/workspace`,{method:"POST",headers:h,body:JSON.stringify({companyId,requestKey:randomUUID(),...payload})});
    const post=async(payload:Record<string,unknown>,h=headers)=>{const response=await send(payload,h);assert.equal(response.status,200,await response.clone().text());return (await response.json()).data as {id:string;revision:number};};
    const read=(extra:Record<string,string>={},h=headers)=>request(`${origin}/api/tasks?${new URLSearchParams({companyId,...extra})}`,{headers:h});
    assert.equal((await request(`${origin}/api/tasks?companyId=${companyId}`)).status,401);assert.equal((await read({companyId:"foreign"})).status,403);assert.equal((await read({page:"0"})).status,400);assert.equal((await read({view:"staff"},staffHeaders)).status,403);
    assert.equal((await send({action:"task.create",title:"Refusé",priority:"NORMAL"},staffHeaders)).status,403);
    const create={action:"task.create",requestKey:randomUUID(),title:"Préparation RP HTTP",description:"Description de la tâche HTTP",priority:"HIGH",assigneeId:member.id,dueAt:"2026-01-01T12:00:00Z",checklist:["Contrôler le matériel"]};
    const task=await post(create);assert.deepEqual(await post(create),task);assert.equal(await db.notification.count({where:{userId:staff.id,title:"Une tâche vous a été assignée"}}),1);
    const detailResponse=await read({taskId:task.id},staffHeaders);assert.equal(detailResponse.status,200);assert.match(detailResponse.headers.get("cache-control")||"",/no-store/);const detail=await detailResponse.json();assert.equal(detail.participate,true);assert.equal(detail.selected.description,create.description);assert.equal(detail.selected.assigneeId,member.id);
    let rev=(await post({action:"task.status",taskId:task.id,revision:0,status:"IN_PROGRESS"},staffHeaders)).revision;
    assert.equal((await send({action:"task.status",taskId:task.id,revision:rev,status:"DONE"},staffHeaders)).status,409);
    rev=(await post({action:"task.check",taskId:task.id,revision:rev,itemId:detail.selected.checklist[0].id,done:true},staffHeaders)).revision;
    const comment={action:"task.comment",requestKey:randomUUID(),taskId:task.id,revision:rev,body:"Matériel RP contrôlé"};rev=(await post(comment,staffHeaders)).revision;await post(comment,staffHeaders);
    rev=(await post({action:"task.status",taskId:task.id,revision:rev,status:"DONE"},staffHeaders)).revision;
    const board=await read({view:"board",q:"Préparation RP HTTP"});assert.equal(board.status,200);assert.equal((await board.json()).board.find((c:{id:string})=>c.id==="DONE").total,1);
    rev=(await post({action:"task.archive",taskId:task.id,revision:rev,archived:true,reason:"Préparation RP conservée"})).revision;
    const archived=await (await read({taskId:task.id,archived:"true"},staffHeaders)).json();assert.equal(archived.selected.archived,true);assert.equal(archived.comments.length,1);assert.ok(archived.events.some((e:{action:string})=>e.action==="ARCHIVE"));assert.ok(archived.events.every((e:object)=>!("snapshot" in e)));
    assert.equal((await send({action:"task.comment",taskId:task.id,revision:rev,body:"Écriture sur archive"},staffHeaders)).status,409);
    await post({action:"task.archive",taskId:task.id,revision:rev,archived:false,reason:"Reprendre le suivi RP"});
    const workspace=await (await request(`${origin}/api/workspace?companyId=${companyId}`,{headers})).json();assert.equal(workspace.current.openTaskCount,0);assert.ok(!JSON.stringify(workspace.current.tasks).includes(create.description));
    await post({action:"module.toggle",key:"tasks",enabled:false});assert.equal((await read({},staffHeaders)).status,403);
  }finally{
    if(companyId){await db.task.deleteMany({where:{companyId}});await db.company.delete({where:{id:companyId}});}await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();
  }
});

test("HTTP: announcements keep drafts and departmental posts private and confirm reads once",async()=>{
  const origin=process.env.BETTER_AUTH_URL||"http://localhost:3000",suffix=randomUUID(),users:string[]=[];let companyId="";
  try{
    const owner=await db.user.create({data:{name:"Direction annonces HTTP",email:`ann-owner-${suffix}@example.test`}});users.push(owner.id);
    const staff=await db.user.create({data:{name:"Atelier annonces HTTP",email:`ann-staff-${suffix}@example.test`}});users.push(staff.id);
    const office=await db.user.create({data:{name:"Bureau annonces HTTP",email:`ann-office-${suffix}@example.test`}});users.push(office.id);
    companyId=(await execute(owner,undefined,{action:"company.create",name:`Annonces HTTP ${suffix}`,sector:"Garage"}) as {id:string}).id;
    const role=await db.companyRole.findFirstOrThrow({where:{companyId,isOwner:false}});
    await db.companyMember.createMany({data:[{companyId,userId:staff.id,roleId:role.id,characterName:"Alex Atelier HTTP",department:"Atelier"},{companyId,userId:office.id,roleId:role.id,characterName:"Charlie Bureau HTTP",department:"Bureau"}]});
    const signedHeaders=async(userId:string)=>{const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId,token,expiresAt:new Date(Date.now()+600000)}});const cookie=getCookies(auth.options).sessionToken;return {Cookie:(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0],Origin:origin,"Content-Type":"application/json"};};
    const headers=await signedHeaders(owner.id),staffHeaders=await signedHeaders(staff.id),officeHeaders=await signedHeaders(office.id);
    const send=(payload:Record<string,unknown>,h=headers)=>request(`${origin}/api/workspace`,{method:"POST",headers:h,body:JSON.stringify({companyId,requestKey:randomUUID(),...payload})});
    const post=async(payload:Record<string,unknown>,h=headers)=>{const r=await send(payload,h);assert.equal(r.status,200,await r.clone().text());return (await r.json()).data as {id:string;revision:number;readAt?:string};};
    const read=(extra:Record<string,string>={},h=headers)=>request(`${origin}/api/announcements?${new URLSearchParams({companyId,...extra})}`,{headers:h});
    assert.equal((await request(`${origin}/api/announcements?companyId=${companyId}`)).status,401);assert.equal((await read({companyId:"foreign"})).status,403);assert.equal((await read({page:"0"})).status,400);assert.equal((await read({view:"drafts"},staffHeaders)).status,403);
    const content={action:"announcement.save",title:"Consignes atelier HTTP",body:"Texte privé atelier HTTP",priority:"HIGH",scope:"DEPARTMENT",department:"Atelier"};
    assert.equal((await send(content,staffHeaders)).status,403);const draft=await post(content);assert.equal((await read({id:draft.id},staffHeaders)).status,404);
    const publish={action:"announcement.publish",requestKey:randomUUID(),id:draft.id,revision:0};let rev=(await post(publish)).revision;await post(publish);
    assert.equal(await db.notification.count({where:{userId:staff.id,title:"Nouvelle annonce interne"}}),1);assert.equal(await db.notification.count({where:{userId:office.id,title:"Nouvelle annonce interne"}}),0);
    const visible=await read({id:draft.id},staffHeaders);assert.equal(visible.status,200);assert.match(visible.headers.get("cache-control")||"",/no-store/);assert.equal((await visible.json()).selected.body,content.body);
    assert.equal((await read({id:draft.id},officeHeaders)).status,404);assert.equal((await send({action:"announcement.read",id:draft.id},officeHeaders)).status,404);
    const ack={action:"announcement.read",requestKey:randomUUID(),id:draft.id};const first=await post(ack,staffHeaders);assert.deepEqual(await post(ack,staffHeaders),first);assert.equal(await db.announcementRead.count({where:{announcementId:draft.id}}),1);
    const personal=await (await read({id:draft.id},staffHeaders)).json();assert.equal(personal.readers.length,0);assert.equal(personal.selected.reads.length,1);assert.ok(personal.events.every((event:object)=>!("snapshot" in event)));
    rev=(await post({action:"announcement.pin",id:draft.id,revision:rev,pinned:true})).revision;
    rev=(await post({action:"announcement.transition",id:draft.id,revision:rev,decision:"ARCHIVE",reason:"Consignes conservées HTTP"})).revision;
    assert.equal((await (await read({view:"archives"},staffHeaders)).json()).total,1);await post({action:"announcement.transition",id:draft.id,revision:rev,decision:"RESTORE",reason:"Consignes réactivées HTTP"});
    const scheduled=await post({...content,scope:"ALL",department:null,title:"Publication future HTTP"});await post({action:"announcement.publish",id:scheduled.id,revision:0,startsAt:new Date(Date.now()+3600000).toISOString()});
    assert.equal((await read({id:scheduled.id,now:"2099-01-01"},staffHeaders)).status,404);assert.equal((await (await read({view:"scheduled"})).json()).total,1);
    const workspace=await (await request(`${origin}/api/workspace?companyId=${companyId}`,{headers:officeHeaders})).text();assert.ok(!workspace.includes(content.body));assert.match(await (await request(`${origin}/app?company=${companyId}`,{headers})).text(),/Annonces internes/);
    await post({action:"module.toggle",key:"announcements",enabled:false});assert.equal((await read({},staffHeaders)).status,403);
  }finally{
    if(companyId){await db.announcement.deleteMany({where:{companyId}});await db.company.delete({where:{id:companyId}});}await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();
  }
});

test("HTTP: calendar invitations are private, responses reset on reschedule and cancellation persists",async()=>{
  const origin=process.env.BETTER_AUTH_URL||"http://localhost:3000",suffix=randomUUID(),users:string[]=[];let companyId="";
  try{
    const owner=await db.user.create({data:{name:"Direction calendrier HTTP",email:`cal-owner-${suffix}@example.test`}});users.push(owner.id);
    const staff=await db.user.create({data:{name:"Invité calendrier HTTP",email:`cal-staff-${suffix}@example.test`}});users.push(staff.id);
    const peer=await db.user.create({data:{name:"Lecteur calendrier HTTP",email:`cal-peer-${suffix}@example.test`}});users.push(peer.id);
    companyId=(await execute(owner,undefined,{action:"company.create",name:`Calendrier HTTP ${suffix}`,sector:"Garage"}) as {id:string}).id;
    const role=await db.companyRole.findFirstOrThrow({where:{companyId,isOwner:false}});
    const member=await db.companyMember.create({data:{companyId,userId:staff.id,roleId:role.id,characterName:"Alex invité HTTP"}});await db.companyMember.create({data:{companyId,userId:peer.id,roleId:role.id,characterName:"Lecteur HTTP"}});
    const signedHeaders=async(userId:string)=>{const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId,token,expiresAt:new Date(Date.now()+600000)}});const cookie=getCookies(auth.options).sessionToken;return {Cookie:(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0],Origin:origin,"Content-Type":"application/json"};};
    const headers=await signedHeaders(owner.id),staffHeaders=await signedHeaders(staff.id),peerHeaders=await signedHeaders(peer.id);
    const send=(payload:Record<string,unknown>,h=headers)=>request(`${origin}/api/workspace`,{method:"POST",headers:h,body:JSON.stringify({companyId,requestKey:randomUUID(),...payload})});
    const post=async(payload:Record<string,unknown>,h=headers)=>{const r=await send(payload,h);assert.equal(r.status,200,await r.clone().text());return (await r.json()).data as {id:string;revision:number};};
    const start=new Date(Date.now()+86400000),end=new Date(+start+3600000),from=start.toISOString().slice(0,10),to=new Date(+start+28*86400000).toISOString().slice(0,10);
    const read=(extra:Record<string,string>={},h=headers)=>request(`${origin}/api/calendar?${new URLSearchParams({companyId,from,to,...extra})}`,{headers:h});
    assert.equal((await request(`${origin}/api/calendar?companyId=${companyId}`)).status,401);assert.equal((await read({companyId:"foreign"})).status,403);assert.equal((await read({from:"2026-01-01",to:"2027-01-01"})).status,400);assert.equal((await read({view:"staff"},staffHeaders)).status,403);
    const fields={title:"Réunion privée HTTP",description:"Contenu privé du calendrier HTTP",location:"Atelier RP",kind:"MEETING",visibility:"INVITEES",start:start.toISOString(),end:end.toISOString(),memberIds:[member.id]};
    assert.equal((await send({action:"calendar.create",...fields},staffHeaders)).status,403);
    const create={action:"calendar.create",requestKey:randomUUID(),...fields};const event=await post(create);assert.deepEqual(await post(create),event);assert.equal(await db.notification.count({where:{userId:staff.id,title:"Nouvelle invitation au calendrier"}}),1);
    assert.equal((await read({id:event.id},peerHeaders)).status,404);assert.equal((await (await read({q:"Réunion privée"},peerHeaders)).json()).total,0);
    const detail=await read({id:event.id},staffHeaders);assert.equal(detail.status,200);assert.match(detail.headers.get("cache-control")||"",/no-store/);const data=await detail.json();assert.equal(data.selected.description,fields.description);assert.equal(data.invites.length,0);assert.equal(data.selected.invites.length,1);
    const reply={action:"calendar.reply",requestKey:randomUUID(),id:event.id,revision:0,inviteRevision:0,response:"ACCEPTED",note:"Réponse RP privée HTTP"};await post(reply,staffHeaders);await post(reply,staffHeaders);assert.equal(await db.calendarHistory.count({where:{eventId:event.id,action:"REPLY"}}),1);
    const moved={...fields,start:new Date(+start+3600000).toISOString(),end:new Date(+end+3600000).toISOString()};let rev=(await post({action:"calendar.update",id:event.id,revision:0,...moved})).revision;
    assert.equal((await send({...reply,requestKey:randomUUID()},staffHeaders)).status,409);const reset=await (await read({id:event.id},staffHeaders)).json();assert.equal(reset.selected.invites[0].response,"PENDING");assert.equal(reset.selected.invites[0].responseNote,"");
    await post({action:"calendar.reply",id:event.id,revision:rev,inviteRevision:reset.selected.invites[0].revision,response:"DECLINED",note:"Indisponible RP"},staffHeaders);
    rev=(await post({action:"calendar.cancel",id:event.id,revision:rev,reason:"Réunion annulée après contrôle HTTP"})).revision;
    const cancelled=await (await read({id:event.id,cancelled:"true"},staffHeaders)).json();assert.equal(cancelled.selected.status,"CANCELLED");assert.equal(cancelled.selected.invites[0].response,"DECLINED");assert.ok(cancelled.events.every((e:object)=>!("snapshot" in e)));assert.equal((await send({action:"calendar.reply",id:event.id,revision:rev,inviteRevision:3,response:"ACCEPTED",note:"Refusé"},staffHeaders)).status,409);
    const publicEvent=await post({action:"calendar.create",...fields,title:"Événement partagé HTTP",visibility:"ALL",memberIds:[]});const publicView=await (await read({id:publicEvent.id},peerHeaders)).json();assert.equal(publicView.selected.visibility,"ALL");assert.equal(publicView.selected.invites.length,0);
    const past=await post({action:"calendar.create",...fields,start:new Date(Date.now()-2*86400000).toISOString(),end:new Date(Date.now()-86400000-3600000).toISOString()});const pastDetail=await (await read({id:past.id})).json();const invitation=pastDetail.invites[0];await post({action:"calendar.attendance",id:past.id,revision:0,inviteId:invitation.id,inviteRevision:0,attendance:"PRESENT",note:"Participation RP contrôlée HTTP"});assert.equal((await (await read({id:past.id},staffHeaders)).json()).selected.invites[0].attendance,"PRESENT");
    assert.ok(!(await (await request(`${origin}/api/workspace?companyId=${companyId}`,{headers:peerHeaders})).text()).includes(fields.description));assert.match(await (await request(`${origin}/app?company=${companyId}`,{headers})).text(),/Calendrier/);
    await post({action:"module.toggle",key:"calendar",enabled:false});assert.equal((await read({},staffHeaders)).status,403);
  }finally{
    if(companyId){await db.calendarEvent.deleteMany({where:{companyId}});await db.calendarSeries.deleteMany({where:{companyId}});await db.company.delete({where:{id:companyId}});}await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{key:{startsWith:`app:${id}:`}}});await db.$disconnect();
  }
});

test("HTTP: platform owner, pending Discord access, space isolation and conservative suspension",async()=>{
  const origin=process.env.BETTER_AUTH_URL!,prefix=`http-platform-${randomUUID()}`,userIds:string[]=[],sessionIds:string[]=[],keys:string[]=[],serverIds:string[]=[];
  const fixture=async(name:string,discordId?:string)=>{const user=await db.user.create({data:{name:`${prefix}-${name}`,email:`${prefix}-${name}@example.test`}});userIds.push(user.id);if(discordId)await db.account.create({data:{id:randomUUID(),userId:user.id,providerId:"discord",accountId:discordId,accessToken:"http-fixture-private-token"}});const id=randomUUID(),token=randomBytes(32).toString("hex");sessionIds.push(id);await db.session.create({data:{id,userId:user.id,token,expiresAt:new Date(Date.now()+600000)}});const cookie=getCookies(auth.options).sessionToken;return {user,headers:{Cookie:(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0],Origin:origin,"Content-Type":"application/json"}};};
  try{
    const owner=await fixture("owner",process.env.RPILOT_OWNER_DISCORD_ID),normal=await fixture("normal");
    assert.equal((await request(`${origin}/api/admin?view=users`)).status,401);
    assert.equal((await request(`${origin}/api/admin?view=users`,{headers:normal.headers})).status,403);
    const command=async(headers:Record<string,string>,payload:Record<string,unknown>)=>{const requestKey=randomUUID();keys.push(requestKey);return request(`${origin}/api/admin`,{method:"POST",headers,body:JSON.stringify({...payload,requestKey})});};
    const created=await command(owner.headers,{action:"server.create",name:prefix,slug:prefix,maxCompanies:10,maxUsers:10,reason:"HTTP fixture community"});assert.equal(created.status,200,await created.clone().text());const server= (await created.json()).data as {id:string};serverIds.push(server.id);
    const privateList=await request(`${origin}/api/admin?view=servers&id=${server.id}`,{headers:owner.headers});assert.equal(privateList.status,200);assert.match(privateList.headers.get("cache-control")??"",/no-store/);const list=await privateList.json();const role=list.selectedServer.roles.find((r:{name:string})=>r.name==="Administrateur");
    const grant=await command(owner.headers,{action:"server.grant",serverId:server.id,discordId:"700000000000000002",roleId:role.id,status:"ACTIVE",reason:"Invite future Discord administrator"});assert.equal(grant.status,200,await grant.clone().text());
    const invited=await fixture("invited","700000000000000002");
    const spaces=await request(`${origin}/espaces`,{headers:invited.headers});assert.equal(spaces.status,200);assert.match(await spaces.text(),new RegExp(prefix));
    assert.equal((await request(`${origin}/api/admin?view=users`,{headers:invited.headers})).status,403);
    assert.equal((await request(`${origin}/api/workspace?space=${server.id}`,{headers:normal.headers})).status,403);
    const workspace=await request(`${origin}/api/workspace?space=${server.id}`,{headers:invited.headers});assert.equal(workspace.status,200);assert.equal((await workspace.json()).space,server.id);
    const panel=await request(`${origin}/admin/servers`,{headers:owner.headers});assert.equal(panel.status,200);assert.match(await panel.text(),/Administration Nyro Dashboard|ADMINISTRATION NYRO DASHBOARD/);
    const users=await request(`${origin}/api/admin?view=users`,{headers:owner.headers});const serialized=await users.text();assert.ok(!serialized.includes("http-fixture-private-token"));assert.ok(!serialized.includes('"token"'));
    const invalidOrigin=await command({...owner.headers,Origin:"https://foreign.example"},{action:"sessions.revoke",id:normal.user.id,confirmation:normal.user.id,reason:"Origin rejection"});assert.equal(invalidOrigin.status,403);
    const suspended=await command(owner.headers,{action:"access.status",target:"user",id:normal.user.id,revision:0,confirmation:normal.user.id,status:"SUSPENDED",reason:"Conservative fixture suspension"});assert.equal(suspended.status,200,await suspended.clone().text());
    assert.equal((await request(`${origin}/api/workspace`,{headers:normal.headers})).status,401);assert.equal(await db.session.count({where:{userId:normal.user.id}}),0);
    const audit=await request(`${origin}/api/admin?view=audit&q=${normal.user.id}`,{headers:owner.headers});assert.equal(audit.status,200);assert.ok((await audit.json()).total>=1);
  }finally{
    await db.platformCommand.deleteMany({where:{requestKey:{in:[...keys,...sessionIds.map(id=>`admin-visit:${createHash("sha256").update(id).digest("hex")}`)]}}});await db.platformAudit.deleteMany({where:{actorId:{in:userIds}}});await db.rPServer.deleteMany({where:{id:{in:serverIds}}});await db.user.deleteMany({where:{id:{in:userIds}}});for(const id of userIds)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`admin:${id}:`}},{key:{startsWith:`app:${id}:`}}]}});
  }
});

test("HTTP: public directory, private requests, manager decisions and ordinary community access",async()=>{
  const origin=process.env.BETTER_AUTH_URL!,prefix=`http-admission-${randomUUID()}`,users:string[]=[],servers:string[]=[];
  const fixture=async(name:string)=>{const user=await db.user.create({data:{name:`${prefix}-${name}`,email:`${prefix}-${name}@example.test`}});users.push(user.id);await db.account.create({data:{id:randomUUID(),userId:user.id,providerId:"discord",accountId:String(860000000000000000n+BigInt(users.length))}});const token=randomUUID();await db.session.create({data:{id:randomUUID(),userId:user.id,token,expiresAt:new Date(Date.now()+600000)}});const cookie=getCookies(auth.options).sessionToken;return {user,headers:{Cookie:(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0],Origin:origin,"Content-Type":"application/json"}};};
  try{
    const manager=await fixture("manager"),a=await fixture("a"),b=await fixture("b");const server=await db.rPServer.create({data:{name:prefix,visibility:"PUBLIC",accessMode:"REQUEST",maxUsers:2}});servers.push(server.id);const role=await db.serverRole.create({data:{serverId:server.id,name:"Administrateur de fixture",permissions:["members.manage"]}});await db.serverMember.create({data:{serverId:server.id,userId:manager.user.id,roleId:role.id}});
    const command=(who:typeof a,payload:Record<string,unknown>)=>request(`${origin}/api/servers/access`,{method:"POST",headers:who.headers,body:JSON.stringify({requestKey:randomUUID(),...payload})});
    assert.equal((await request(`${origin}/api/servers/access`)).status,401);const directory=await request(`${origin}/api/servers/access?q=${prefix}`,{headers:a.headers});assert.equal(directory.status,200);assert.match(directory.headers.get("cache-control")??"",/no-store/);assert.equal((await directory.json()).total,1);
    const sent=await command(a,{action:"request",serverId:server.id,message:"Présentation privée RP du premier candidat de vérification."});assert.equal(sent.status,200,await sent.clone().text());const application=(await sent.json()).data as {id:string;revision:number};
    assert.equal((await request(`${origin}/api/servers/access?view=requests&serverId=${server.id}`,{headers:b.headers})).status,403);assert.equal((await request(`${origin}/api/servers/access?view=mine&id=${application.id}`,{headers:b.headers})).status,404);
    const queue=await request(`${origin}/api/servers/access?view=requests&serverId=${server.id}`,{headers:manager.headers});assert.equal((await queue.json()).total,1);
    const accepted=await command(manager,{action:"decide",serverId:server.id,id:application.id,revision:0,status:"ACCEPTED",reason:"Projet RP accepté après lecture de la demande."});assert.equal(accepted.status,200,await accepted.clone().text());
    assert.equal(await db.serverMember.count({where:{serverId:server.id,userId:a.user.id}}),0);const workspace=await request(`${origin}/api/workspace?space=${server.id}`,{headers:a.headers});assert.equal(workspace.status,200);assert.equal((await workspace.json()).current,null);assert.equal((await request(`${origin}/api/admin?view=users`,{headers:a.headers})).status,403);
    const forbiddenCompany=await request(`${origin}/api/workspace`,{method:"POST",headers:a.headers,body:JSON.stringify({action:"company.create",name:"No server privilege",sector:"Garage",serverId:server.id})});assert.equal(forbiddenCompany.status,403);
    const next=await command(b,{action:"request",serverId:server.id,message:"Présentation RP du candidat suivant pour contrôler le quota."});assert.equal(next.status,200);const nextApplication=(await next.json()).data;const quota=await command(manager,{action:"decide",serverId:server.id,id:nextApplication.id,revision:0,status:"ACCEPTED",reason:"Refus technique de dépassement de quota."});assert.equal(quota.status,400);
    const member=await db.serverCommunityMember.findUniqueOrThrow({where:{serverId_userId:{serverId:server.id,userId:a.user.id}}});const block=await command(manager,{action:"member.status",serverId:server.id,id:member.id,revision:member.revision,status:"BLOCKED",reason:"Blocage communautaire motivé de recette."});assert.equal(block.status,200);assert.equal((await request(`${origin}/api/workspace?space=${server.id}`,{headers:a.headers})).status,403);
    const history=await request(`${origin}/api/servers/access?view=community&id=${member.id}`,{headers:a.headers});assert.equal(history.status,200);assert.ok((await history.json()).events.some((e:{reason:string})=>e.reason.includes("Blocage communautaire")));
    await db.rPServer.update({where:{id:server.id},data:{accessMode:"OPEN"}});const joined=await command(b,{action:"join",serverId:server.id});assert.equal(joined.status,200,await joined.clone().text());assert.equal((await db.serverAccessRequest.findUniqueOrThrow({where:{id:nextApplication.id}})).status,"WITHDRAWN");
    const spaces=await request(`${origin}/espaces`,{headers:b.headers});assert.equal(spaces.status,200);assert.match(await spaces.text(),new RegExp(prefix));const page=await request(`${origin}/serveurs`,{headers:b.headers});assert.equal(page.status,200);assert.match(await page.text(),/Rejoindre une communauté/);
    const csrf=await request(`${origin}/api/servers/access`,{method:"POST",headers:{...b.headers,Origin:"https://foreign.example"},body:JSON.stringify({action:"join",serverId:server.id,requestKey:randomUUID()})});assert.equal(csrf.status,403);
  }finally{await db.platformAudit.deleteMany({where:{actorId:{in:users}}});await db.rPServer.deleteMany({where:{id:{in:servers}}});await db.user.deleteMany({where:{id:{in:users}}});for(const id of users)await db.rateLimit.deleteMany({where:{OR:[{key:{startsWith:`admission:${id}:`}},{key:{startsWith:`app:${id}:`}}]}});}
});


test("HTTP: public documentation, metadata, search and protected persistent feedback",async()=>{
 const origin=process.env.BETTER_AUTH_URL!;let userId="",voterHash="";
 try{
  for(const path of ["/","/docs","/tarifs","/legal/conditions","/legal/confidentialite","/legal/mentions-legales"]){const response=await request(origin+path);assert.equal(response.status,200,path);const html=await response.text();assert.match(html,/<h1[ >]/);assert.ok(!response.headers.get("set-cookie"),"Public content must not create a login session");}
  for(const article of docArticles){const response=await request(origin+"/docs/"+article.slug);assert.equal(response.status,200,article.slug);const html=await response.text();assert.ok(html.includes(article.title),article.slug);assert.ok(html.includes("rel=\"canonical\""),"Public canonical metadata missing");assert.ok(html.includes("id=\"presentation\""),"Shareable section anchors missing");}
  const missing=await request(origin+"/docs/article-inexistant");assert.equal(missing.status,404);
  const search=await request(origin+"/api/docs/search");assert.equal(search.status,200);assert.match(search.headers.get("cache-control")??"",/public/);const searchRows=await search.json();assert.equal(searchRows.length,74);assert.doesNotMatch(JSON.stringify(searchRows),/PLATFORM_OWNER|BETTER_AUTH_SECRET|DATABASE_URL/);
  const map=await request(origin+"/sitemap.xml");assert.equal(map.status,200);const xml=await map.text();assert.match(xml,/docs\/stocks/);assert.ok([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].every(m=>!new URL(m[1]).pathname.startsWith("/admin")),"Private admin routes must stay outside the sitemap");
  const robots=await request(origin+"/robots.txt");assert.equal(robots.status,200);assert.match(await robots.text(),/Disallow: \/admin/);
  const endpoint=origin+"/api/docs/feedback",baseHeaders={Origin:origin,"Content-Type":"application/json"},body=JSON.stringify({article:"stocks",helpful:true});
  assert.equal((await request(endpoint,{method:"POST",headers:baseHeaders,body})).status,401);
  const user=await db.user.create({data:{name:"Docs HTTP fixture",email:"docs-http-"+randomUUID()+"@example.test"}});userId=user.id;voterHash=createHash("sha256").update("rpilot-docs-v1:"+user.id).digest("hex");
  const token=randomBytes(32).toString("hex");await db.session.create({data:{id:randomUUID(),userId,token,expiresAt:new Date(Date.now()+600000)}});
  const cookie=getCookies(auth.options).sessionToken;const signed=(await serializeSignedCookie(cookie.name,token,process.env.BETTER_AUTH_SECRET!,cookie.attributes)).split(";")[0];const headers={...baseHeaders,Cookie:signed};
  assert.equal((await request(endpoint,{method:"POST",headers:{...headers,Origin:"https://example.test"},body})).status,403);
  assert.equal((await request(endpoint,{method:"POST",headers,body:JSON.stringify({article:"stocks",helpful:true,extra:true})})).status,400);
  assert.equal((await request(endpoint,{method:"POST",headers,body:JSON.stringify({article:"missing",helpful:true})})).status,404);
  assert.equal((await request(endpoint,{method:"POST",headers,body:JSON.stringify({article:"stocks",helpful:true,extra:"x".repeat(2100)})})).status,413);
  for(const helpful of [true,true,false]){const r=await request(endpoint,{method:"POST",headers,body:JSON.stringify({article:"stocks",helpful})});assert.equal(r.status,200,await r.clone().text());assert.match(r.headers.get("cache-control")??"",/no-store/);}
  assert.equal(await db.documentationFeedback.count({where:{voterHash}}),1);assert.equal((await db.documentationFeedback.findFirstOrThrow({where:{voterHash}})).helpful,false);
  for(let i=3;i<10;i++)assert.equal((await request(endpoint,{method:"POST",headers,body})).status,200);
  assert.equal((await request(endpoint,{method:"POST",headers,body})).status,429);
 }finally{if(voterHash){await db.documentationFeedback.deleteMany({where:{voterHash}});await db.rateLimit.deleteMany({where:{key:"docs-feedback:"+voterHash}});}if(userId)await db.user.delete({where:{id:userId}});}
});

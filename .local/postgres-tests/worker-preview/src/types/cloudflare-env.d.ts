// Bindings are server-only. Avoid adding Workers' global DOM definitions to the
// React/browser typecheck (in particular its different Response.json() type).
declare module "cloudflare:workers" {
  export const env:import("../lib/database-runtime").RuntimeEnvironment;
}
declare module "*.ttf?inline" {const dataUrl:string;export default dataUrl;}

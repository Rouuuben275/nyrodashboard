/** Only application-owned destinations are accepted by the authentication UI. */
export function workspaceHref(params: { invite?: string; company?: string } = {}) {
  const query = new URLSearchParams();
  if (params.invite) query.set("invite", params.invite);
  if (params.company) query.set("company", params.company);
  return `/app${query.size ? `?${query}` : ""}`;
}
export function safeReturnTo(value?: string) {
  return value && /^(\/compte\/slots|\/espaces|\/serveurs(?:\/[A-Za-z0-9_-]{1,100}\/acces)?|\/admin(?:\/(?:servers|users|companies|administrators|audit))?|\/candidatures|\/recrutement(?:\/[A-Za-z0-9_-]{1,100})?)$/.test(value) ? value : undefined;
}
export function loginHref(invite?: string, returnTo?: string) {
  const query = new URLSearchParams();
  if (invite) query.set("invite", invite);
  const destination = safeReturnTo(returnTo);
  if (destination) query.set("returnTo", destination);
  return `/login${query.size ? `?${query}` : ""}`;
}

export const platformPermissions=["servers.read","servers.create","servers.manage","users.read","users.manage","users.slots.manage","companies.read","companies.manage","audit.read"] as const;
export const platformPermissionLabels:Record<typeof platformPermissions[number],string>={"users.slots.manage":"Attribuer des slots d’entreprise aux comptes Discord","servers.read":"Consulter les serveurs","servers.create":"Créer des serveurs","servers.manage":"Gérer les serveurs et leurs accès","users.read":"Consulter les utilisateurs","users.manage":"Suspendre les utilisateurs et révoquer les sessions","companies.read":"Consulter les entreprises","companies.manage":"Suspendre et réactiver les entreprises","audit.read":"Consulter l’audit central"};
// Platform grants never convey the owner role or the ability to delegate platform rights.
export const defaultServerRoles=[
  {name:"Propriétaire du serveur",permissions:["dashboard.read","companies.manage","companies.create","server.manage","members.manage","roles.manage","audit.read","statistics.read"]},
  {name:"Administrateur",permissions:["dashboard.read","companies.manage","companies.create","server.manage","members.manage","audit.read","statistics.read"]},
  {name:"Responsable des entreprises",permissions:["dashboard.read","companies.manage","companies.create"]},
  {name:"Responsable économique",permissions:["dashboard.read","statistics.read","economy.manage"]},
  {name:"Modérateur administratif",permissions:["dashboard.read","members.manage","audit.read"]},
  {name:"Observateur",permissions:["dashboard.read"]},
];

export type ModuleDefinition = { key: string; name: string; description: string; category: string; route: string; permission: string; dependencies: string[]; available: boolean; required?: boolean };
const available = (key: string, name: string, description: string, category: string, permission: string, dependencies: string[] = [], required = false): ModuleDefinition => ({ key, name, description, category, permission, dependencies, available: true, route: `/${key}`, required });
export const modules: ModuleDefinition[] = [
  available("dashboard", "Vue d’ensemble", "Les indicateurs et l’activité de votre entreprise, en un regard.", "Pilotage", "dashboard.read", [], true),
  available("employees", "Employés", "Votre équipe, ses grades et ses informations RP.", "Ressources humaines", "employees.read"),
  available("roles", "Grades et permissions", "Des accès adaptés aux responsabilités de chacun.", "Ressources humaines", "roles.manage", [], true),
  available("planning", "Planning", "Organisez les services et les horaires de vos équipes.", "Ressources humaines", "planning.read", ["employees"]),
  available("time", "Pointage", "Prise de service et suivi des heures depuis le navigateur.", "Ressources humaines", "time.use", ["employees"]),
  available("leaves", "Absences et congés", "Demandes d’absence et validation par les responsables.", "Ressources humaines", "leaves.read", ["employees"]),
  available("sales", "Ventes", "Encaissez vos prestations avec un stock toujours à jour.", "Commerce", "sales.read", ["products", "finance"]),
  available("cash", "Caisse dédiée", "Catalogue rapide, panier, remises autorisées, paiements RP, tickets PDF et historique partagé avec les ventes.", "Commerce", "sales.create", ["sales"]),
  available("finance", "Comptabilité", "Un journal financier RP traçable, sans modification du solde.", "Finance", "finance.read"),
  available("expenses", "Dépenses", "Enregistrez et validez les dépenses de l’entreprise.", "Finance", "expenses.read", ["finance"]),
  available("products", "Produits et prestations", "Un catalogue personnalisé de produits et services.", "Commerce", "products.read"),
  available("inventory", "Stocks", "Mouvements, inventaires, entrepôts et transferts, sans script de jeu.", "Commerce", "inventory.read", ["products"]),
  available("calendar","Calendrier","Événements partagés ou privés, invitations, réponses, récurrences et participation.","Organisation","dashboard.read"),
  available("announcements","Annonces internes","Brouillons, annonces générales ou départementales, publications datées et suivi de lecture.","Organisation","dashboard.read"),
  available("tasks", "Tâches", "Gardez le cap sur les actions de votre équipe.", "Organisation", "tasks.read"),
  available("documents", "Documents", "Dossiers, fichiers privés, versions, historique et archives. PDF, PNG, JPEG et texte ; 5 Mo par fichier.", "Organisation", "documents.read"),
  available("messages", "Messagerie interne", "Conversations privées et groupes de participants autorisés, historique, recherche et archives personnelles.", "Organisation", "messages.read"),
  available("equipment", "Véhicules et équipements", "Registre, responsables, affectations, entretien, incidents et historique conservé.", "Organisation", "equipment.read"),
  available("statistics", "Statistiques avancées", "Rapports réels selon les droits : trésorerie RP, ventes, services validés, stocks et commandes. Widgets personnels et exports.", "Pilotage", "statistics.read"),
  available("audit", "Historique et audit", "Chaque action sensible reste consultable et attribuée.", "Pilotage", "audit.read", [], true),
  available("crm", "Clients et CRM", "Répertoire RP, coordonnées, segments, notes et documents liés. Rendez-vous à venir.", "Commerce", "crm.read"),
  available("quotes", "Devis", "Brouillons, lignes, remises, émission et décision. Conversion en facture si le module Factures est actif.", "Commerce", "quotes.read", ["crm"]),
  available("invoices", "Factures", "Factures RP, statuts, règlements et contre-écritures. Pas de paiement réel ni d’envoi automatique.", "Finance", "invoices.read", ["crm", "finance"]),
  available("suppliers", "Fournisseurs", "Répertoire, contacts, notes et archivage des fournisseurs RP.", "Commerce", "suppliers.read"),
  available("orders", "Commandes d’achat", "Bons de commande et réceptions partielles ou complètes, reliées aux stocks et au journal financier RP.", "Commerce", "orders.read", ["suppliers", "inventory", "finance"]),
  available("recruitment","Recrutement","Offres publiques RP, candidatures Discord, entretiens et embauche après acceptation du candidat.","Ressources humaines","employees.manage",["employees"]),
  available("payroll","Salaires et primes","Périodes, salaires fixes ou horaires, heures validées, commissions et versements RP comptabilisés.","Ressources humaines","employees.read",["employees","finance"]),
  available("reviews","Évaluations","Critères pondérés, campagnes, entretiens, objectifs et suivi personnel après publication.","Ressources humaines","employees.read",["employees"]),
  available("sanctions","Sanctions internes","Types, décisions RP, accusés de lecture, révocations et dossiers confidentiels.","Ressources humaines","employees.read",["employees"]),
  ...[
    ["contracts", "Contrats RP", "Organisation"], ["branches", "Succursales", "Pilotage"], ["automations", "Automatisations", "Pilotage"], ["public", "Mini-site public", "Commerce"], ["partners", "Relations interentreprises", "Commerce"]
  ].map(([key, name, category]) => ({ key, name, category, description: "Prévu dans une prochaine version. Ce module n’est pas encore disponible.", route: `/${key}`, permission: `${key}.read`, dependencies: [], available: false })),
];
export const permissionLabels: Record<string, string> = {
  "equipment.read": "Consulter le registre et l’historique des biens", "equipment.manage": "Gérer les biens, affectations, entretiens et incidents", "statistics.read": "Consulter les statistiques selon les droits des modules sources",
  "messages.read": "Lire ses conversations et rechercher des participants", "messages.send": "Créer des conversations et envoyer des messages",
  "sales.discount": "Appliquer une remise sur une vente RP",
  "documents.read": "Consulter les documents partagés", "documents.manage": "Gérer les documents et consulter les dossiers confidentiels",
  "suppliers.read": "Consulter les fournisseurs RP", "suppliers.manage": "Gérer les fournisseurs RP", "orders.read": "Consulter les commandes d’achat", "orders.manage": "Gérer les commandes et réceptions RP",
  "crm.read": "Consulter les clients RP", "crm.manage": "Gérer les clients RP", "quotes.read": "Consulter les devis", "quotes.manage": "Gérer les devis", "invoices.read": "Consulter les factures", "invoices.manage": "Gérer les factures et règlements RP",
  "dashboard.read": "Voir le tableau de bord", "employees.read": "Voir les employés", "employees.manage": "Gérer les employés et invitations", "roles.manage": "Gérer les grades et les accès",
  "planning.read": "Voir le planning", "planning.manage": "Modifier les services", "time.use": "Pointer ses services", "leaves.read": "Voir ses absences", "leaves.manage": "Valider les absences",
  "sales.read": "Voir les ventes", "sales.create": "Enregistrer une vente", "sales.cancel": "Annuler une vente", "finance.read": "Consulter la comptabilité",
  "expenses.read": "Consulter les dépenses", "expenses.create": "Créer une dépense", "expenses.approve": "Valider les dépenses", "products.read": "Voir le catalogue", "products.manage": "Gérer le catalogue",
  "inventory.read": "Consulter les stocks", "inventory.manage": "Ajuster les stocks", "tasks.read": "Voir les tâches", "tasks.manage": "Gérer les tâches", "audit.read": "Voir le journal d’audit", "modules.manage": "Configurer les modules", "company.manage": "Administrer l’entreprise",
};
export const allPermissions = Object.keys(permissionLabels);
export const defaultEmployeePermissions = ["dashboard.read", "employees.read", "planning.read", "time.use", "leaves.read", "sales.read", "sales.create", "products.read", "inventory.read", "tasks.read"];
export function can(permissions: string[], permission: string) { return permissions.includes(permission); }
export function canDisable(key: string, enabled: string[]) {
  return !modules.some(m => m.required && m.key === key) && !modules.some(m => enabled.includes(m.key) && m.dependencies.includes(key));
}

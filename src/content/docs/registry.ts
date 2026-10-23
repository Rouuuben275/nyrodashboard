import {modules} from "@/domains/modules/registry";

export type DocMeta={id:string;slug:string;title:string;description:string;number:string;chapter:number;category:string;keywords:string[];module?:string;updated:string};
type Entry=[slug:string,title:string,description:string,module?:string];
const definitions:{title:string;entries:Entry[]}[]=[
 {title:"Bien démarrer",entries:[
  ["presentation","Présentation de Nyro Dashboard","Comprendre la gestion RP autonome, les espaces et les limites du produit."],
  ["creer-son-compte","Créer son compte","Votre première connexion avec Discord, sans mot de passe Nyro Dashboard."],
  ["connexion-discord","Se connecter avec Discord","Autorisation Discord, retour au site, session et déconnexion."],
  ["comprendre-les-espaces","Comprendre les espaces","Distinguer compte, communauté RP et entreprise."],
  ["premiere-connexion","Première connexion","Créer ou rejoindre une entreprise et préparer votre première opération."],
  ["navigation-dashboard","Naviguer dans le dashboard","Sélecteurs, navigation, recherche et accès aux modules."],
 ]},
 {title:"Serveurs RP",entries:[
  ["serveurs-rp","Comprendre les serveurs RP","Un espace communautaire distinct du serveur FiveM."],
  ["acceder-au-serveur","Accéder à un serveur","Adhésion ouverte, autorisation et appartenance administrative."],
  ["demander-un-acces","Demander un accès","Déposer, suivre et retirer une demande privée."],
  ["selectionner-son-serveur","Sélectionner son serveur","Retrouver un espace autorisé et ses entreprises accessibles."],
  ["permissions-serveur","Rôles et permissions serveur","Comprendre la différence entre adhérent, administrateur et employé."],
  ["affilier-une-entreprise","Gestion et affiliation des entreprises","Rattacher une entreprise avec les droits et quotas nécessaires."],
  ["administration-serveur","Administration du serveur","Gérer les admissions et comprendre les limites du panel local."],
 ]},
 {title:"Entreprises",entries:[
  ["entreprise-independante","Entreprise indépendante","Créer une entreprise sans rattachement à une communauté RP."],
  ["entreprise-affiliee","Entreprise affiliée","Créer une entreprise rattachée avec une autorisation locale."],
  ["rejoindre-une-entreprise","Rejoindre une entreprise","Invitation nominative ou proposition de recrutement acceptée."],
  ["invitations","Invitations","Inviter un employé et accepter un lien avec le bon compte Discord."],
  ["changer-entreprise","Changer d’entreprise","Un compte, plusieurs équipes, des permissions indépendantes."],
  ["configurer-entreprise","Configurer son entreprise","Informations, seuil des dépenses et affiliation autorisée."],
  ["catalogue-modules","Modules disponibles","Activation, dépendances, désactivation et conservation des données."],
  ["securite-entreprise","Paramètres et sécurité","Isoler les données et déléguer des droits adaptés."],
 ]},
 {title:"Ressources humaines",entries:[
  ["employes","Employés","Invitations, dossiers RP, affectations et historique de carrière.","employees"],
  ["grades","Grades","Créer, ordonner, dupliquer et réaffecter les grades.","roles"],
  ["permissions-entreprise","Permissions","Distinguer consultation, gestion et accès aux données personnelles."],
  ["recrutement","Recrutement","Offres publiques, candidatures, entretiens et embauche consentie.","recruitment"],
  ["planning","Planning","Services, disponibilités, récurrences et conflits.","planning"],
  ["pointage","Pointage","Prise de service, pauses, corrections et validation des heures.","time"],
  ["absences","Absences","Demandes privées, types, décisions et conflits du planning.","leaves"],
  ["paie","Paie","Règles, périodes, bulletins et versements RP tracés.","payroll"],
  ["evaluations","Évaluations","Campagnes, critères, objectifs et publication personnelle.","reviews"],
  ["sanctions","Sanctions","Décisions RP motivées, confidentialité et accusé de lecture.","sanctions"],
 ]},
 {title:"Commerce et finances",entries:[
  ["ventes","Ventes","Enregistrer une vente liée au catalogue, au stock et au journal RP.","sales"],
  ["caisse","Caisse","Catalogue rapide, panier, remises autorisées, tickets PDF et historique de la caisse dédiée.","cash"],
  ["produits","Produits","Prix, coûts, références, seuils et archivage du catalogue.","products"],
  ["stocks","Stocks","Entrées, sorties, inventaires, entrepôts et transferts.","inventory"],
  ["comptabilite","Comptabilité","Comptes RP, opérations, validations et contre-écritures.","finance"],
  ["depenses","Dépenses","Créer une dépense et suivre son approbation.","expenses"],
  ["clients-crm","Clients et CRM","Fiches clients RP, segments, notes et documents commerciaux.","crm"],
  ["devis","Devis","Lignes, remises, émission, décision et conversion.","quotes"],
  ["factures","Factures","Émission, règlement interne RP, annulation et impression.","invoices"],
  ["fournisseurs","Fournisseurs","Contacts, notes et archivage des fournisseurs RP.","suppliers"],
  ["commandes-fournisseurs","Commandes fournisseurs","Bons d’achat et réceptions partielles liées au stock et aux dépenses.","orders"],
 ]},
 {title:"Organisation",entries:[
  ["taches","Tâches","Listes, Kanban, étapes, commentaires et historique.","tasks"],
  ["documents","Documents","État du futur espace documentaire privé.","documents"],
  ["contrats","Contrats RP","État des modèles, signatures RP et archives à venir.","contracts"],
  ["annonces","Annonces","Publications générales ou départementales et suivi de lecture.","announcements"],
  ["messagerie","Messagerie","Conversations privées, groupes, participants, historique et archives personnelles.","messages"],
  ["calendrier","Calendrier","Événements, invitations, réponses et récurrences.","calendar"],
  ["materiel","Matériel","Registre privé, affectations, entretiens, incidents et archives.","equipment"],
  ["succursales","Succursales","État des établissements et distinction avec les entrepôts.","branches"],
 ]},
 {title:"Gestion avancée",entries:[
  ["tableau-de-bord","Tableau de bord","Lire les indicateurs réellement accessibles à votre grade.","dashboard"],
  ["statistiques","Statistiques","Rapports réels, périodes Paris, widgets personnels et exports selon les droits.","statistics"],
  ["automatisations","Automatisations","État des scénarios et traitements programmés.","automations"],
  ["audit","Journal d’audit","Consulter les actions tracées de votre entreprise.","audit"],
  ["mini-site","Mini-site d’entreprise","État de la vitrine publique propre aux entreprises.","public"],
  ["partenaires","Partenaires et relations commerciales","État des accords et échanges entre entreprises.","partners"],
 ]},
 {title:"Abonnements",entries:[
  ["offres","Offres disponibles","La formule Free et les offres payantes non ouvertes."],
  ["quotas","Comprendre les quotas","Limites d’entreprises, d’employés et capacités communautaires."],
  ["changer-formule","Changer de formule","État du changement d’offre, sans parcours de paiement fictif."],
  ["abonnement","Gérer un abonnement","Consulter les informations de formule existantes."],
  ["paiements","Paiements et facturation","Distinguer abonnement SaaS, factures RP et argent en jeu."],
  ["expiration","Expiration et renouvellement","Comportement actuel et limites du renouvellement automatique."],
 ]},
 {title:"Compte et sécurité",entries:[
  ["profil","Mon profil","Identité Discord, personnages RP et informations d’entreprise."],
  ["compte-discord","Compte Discord","Identité vérifiée et limites des comptes liés."],
  ["sessions","Sessions","Durée de connexion, déconnexion et reconnexion."],
  ["notifications","Notifications","Messages internes et limites des rappels programmés."],
  ["mes-permissions","Permissions","Diagnostiquer un accès manquant sans contourner son grade."],
  ["confidentialite","Confidentialité","Comprendre l’accès aux données RP et les contenus publics."],
 ]},
 {title:"Assistance",entries:[
  ["questions-frequentes","Questions fréquentes","Réponses sur FiveM, entreprises, modules et données."],
  ["problemes-connexion","Problèmes de connexion","Discord, callback expiré, cookies et session."],
  ["acces-refuse","Accès refusé","Compte, entreprise, communauté, grade et expiration."],
  ["module-indisponible","Module indisponible","Développement, activation, dépendances et permissions."],
  ["erreurs-frequentes","Erreurs fréquentes","Conflit, quota, opération refusée et indisponibilité technique."],
  ["support","Contacter le support","Préparer un diagnostic sans transmettre de secrets."],
 ]},
];
export const docChapters=definitions.map((chapter,index)=>({title:chapter.title,number:index+1,articles:chapter.entries.map(([slug,title,description,module],i):DocMeta=>({id:slug,slug,title,description,number:`${index+1}.${i+1}`,chapter:index+1,category:chapter.title,module,keywords:[title,chapter.title,module??"",...(module==="payroll"?["salaire","prime","bulletin"]:module==="employees"?["employé","employée","collaborateur"]:module==="inventory"?["stock","entrepôt","inventaire"]:[])],updated:["offres","quotas","changer-formule","abonnement","paiements","audit","entreprise-independante"].includes(slug)?"2026-10-22":"2026-10-21"}))}));
export const docArticles=docChapters.flatMap(c=>c.articles);
export const docBySlug=new Map(docArticles.map(a=>[a.slug,a]));
export const moduleDoc=(key:string)=>docArticles.find(a=>a.module===key);
export const docHref=(slug:string)=>`/docs/${slug}`;
export const docModuleState=(key:string)=>modules.find(m=>m.key===key)?.available?"Disponible · fonctions avancées partielles":"En développement";

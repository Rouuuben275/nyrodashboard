export const widgets=["finance","sales","people","stock","orders"] as const;
export const widgetLabels={finance:"Trésorerie RP",sales:"Ventes",people:"Équipe et services validés",stock:"Stock actuel",orders:"Commandes d’achat"};
export const orderStatusLabels:Record<string,string>={DRAFT:"Brouillons",ORDERED:"Commandées",PARTIAL:"Partiellement reçues",RECEIVED:"Réceptionnées",CANCELLED:"Annulées"};

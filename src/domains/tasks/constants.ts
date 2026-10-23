export const taskBuiltins=[{id:"TODO",name:"À faire"},{id:"IN_PROGRESS",name:"En cours"},{id:"DONE",name:"Terminées"}] as const;
export const taskEvents:Record<string,string>={CREATE:"Création",UPDATE:"Modification",STATUS:"Changement d’état",CHECK:"Checklist",COMMENT:"Commentaire ajouté",ARCHIVE:"Archivage",RESTORE:"Restauration"};

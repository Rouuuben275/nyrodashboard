export type DocSection={id:string;title:string;paragraphs?:string[];steps?:string[];items?:string[];callout?:string;example?:string;links?:{slug:string;label:string}[];table?:{headers:string[];rows:string[][]};faq?:{question:string;answer:string}[];illustration?:"spaces"|"modules"|"flow";screenshot?:"admission-history"};
export type DocContent={sections:DocSection[];related:string[]};
export const section=(id:string,title:string,paragraphs:string[]):DocSection=>({id,title,paragraphs});

"use client";
import {useId,useState,type ReactNode} from "react";
import {Plus,Minus} from "lucide-react";
export function RPilotAccordion({items}:{items:{question:string;answer:ReactNode}[]}){
 const id=useId(),[open,setOpen]=useState<number|null>(null);
 return <div className="rp-accordion">{items.map((item,i)=><section key={item.question}><h3><button type="button" aria-expanded={open===i} aria-controls={`${id}-panel-${i}`} id={`${id}-question-${i}`} onClick={()=>setOpen(open===i?null:i)}>{item.question}{open===i?<Minus size={16}/>:<Plus size={16}/>}</button></h3><div role="region" aria-labelledby={`${id}-question-${i}`} id={`${id}-panel-${i}`} hidden={open!==i}>{item.answer}</div></section>)}</div>;
}

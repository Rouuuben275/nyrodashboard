export async function prepareLogo(file:File,signal:AbortSignal){
 if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Choisissez une image PNG, JPEG ou WebP.");
 if(file.size>8*1024*1024)throw new Error("L’image doit faire au maximum 8 Mo.");
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.decoding="async";image.src=url;await image.decode();
  if(signal.aborted)throw new DOMException("Import annulé","AbortError");
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw new Error("Image trop grande ou illisible. Utilisez une image de moins de 40 mégapixels.");
  for(const max of [512,384,288,216]){
   const ratio=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
   const context=canvas.getContext("2d");if(!context)throw new Error("Préparation de l’image indisponible.");context.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));if(signal.aborted)throw new DOMException("Import annulé","AbortError");
   if(blob&&blob.size<=256*1024)return blob;
  }
  throw new Error("Impossible de réduire cette image. Choisissez un logo plus simple.");
 }finally{URL.revokeObjectURL(url);}
}

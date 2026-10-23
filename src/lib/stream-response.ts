// A binary/CSV response remains streamed by Next.js instead of being buffered
// against the Vercel Function response payload limit. Storage stays in PostgreSQL.
export function streamResponse(body:Uint8Array|string,init:ResponseInit={}){
 const bytes=typeof body==="string"?new TextEncoder().encode(body):body;let offset=0;
 const headers=new Headers(init.headers);headers.delete("Content-Length");
 return new Response(new ReadableStream<Uint8Array>({pull(controller){if(offset>=bytes.length){controller.close();return;}const end=Math.min(offset+65536,bytes.length);controller.enqueue(new Uint8Array(bytes.subarray(offset,end)));offset=end;}}),{...init,headers});
}

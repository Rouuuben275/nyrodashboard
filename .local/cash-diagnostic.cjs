const undici=require('undici');
const original=undici.fetch;
undici.fetch=async function(...args){try{return await original.apply(this,args);}catch(error){const cause=error&&error.cause;console.error('LOCAL_TRANSPORT_CAUSE',JSON.stringify({code:cause&&cause.code,message:cause&&cause.message}));throw error;}};

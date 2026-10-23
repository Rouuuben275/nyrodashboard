export function logoHref(value:{logoAssetId?:string|null;logoUrl?:string|null}|null|undefined){return value?.logoAssetId?`/api/logos/${encodeURIComponent(value.logoAssetId)}`:value?.logoUrl||"";}

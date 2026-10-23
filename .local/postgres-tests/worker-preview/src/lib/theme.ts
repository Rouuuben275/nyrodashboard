export const themes=["dark","light","system"] as const;
export type ThemePreference=typeof themes[number];
// Keep the existing browser key for compatibility with the old workspace toggle.
export const themeStorageKey="rpilot:theme";
export const isTheme=(value:unknown):value is ThemePreference=>themes.includes(value as ThemePreference);
export function resolveTheme(value:ThemePreference,systemDark:boolean){return value==="system"?(systemDark?"dark":"light"):value;}
export function watchSystemTheme(preference:()=>ThemePreference,onChange:()=>void,media:Pick<MediaQueryList,"addEventListener"|"removeEventListener">|null){
 const listener=()=>{if(preference()==="system")onChange();};
 media?.addEventListener("change",listener);return()=>media?.removeEventListener("change",listener);
}
// Runs before first paint, without a database call or making public pages dynamic.
export const themeBootstrap=`(()=>{let p='system';try{const s=localStorage.getItem('rpilot:theme');if(['dark','light','system'].includes(s))p=s;}catch{}const d=p==='dark'||(p==='system'&&typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches);const r=document.documentElement;r.dataset.theme=d?'dark':'light';r.dataset.themePreference=p;r.style.colorScheme=d?'dark':'light';})();`;

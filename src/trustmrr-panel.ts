import { invoke } from '@tauri-apps/api/core';
import type { TrustMRRStartup } from './trustmrr';
import {getConnection,openAccountSettings} from './connections';
const pending = new Map<string,Promise<TrustMRRStartup>>();
export async function mountTrustMRR(root: HTMLElement,force=false): Promise<void> {
    const panel = root.querySelector<HTMLElement>('.trustmrr-view');
    if (!panel) return;
    const status = panel.querySelector<HTMLElement>('.trustmrr-message')!;
    const refresh = root.querySelector<HTMLButtonElement>('.trustmrr-refresh')!;
    let settings;
    try{settings=await getConnection('trustmrr');}catch(error){status.textContent=typeof error==='string'?error:'Could not read account settings.';return;}
    if(!panel.isConnected)return;
    const slug = settings.startupSlug.trim();
    let account=root.querySelector<HTMLButtonElement>('.trustmrr-configure');if(!account){account=document.createElement('button');account.className='quiet-action trustmrr-configure';account.textContent='Account settings';account.onclick=()=>openAccountSettings('trustmrr');panel.append(account);}
    refresh.onclick = () => { void mountTrustMRR(root,true); };
    refresh.disabled = true;
    panel.setAttribute('aria-busy','true');
    status.textContent = '';
    if(account)account.hidden=settings.enabled&&settings.hasToken&&Boolean(slug);
    try {
        if (!settings.enabled||!settings.hasToken||!slug){const name=panel.querySelector<HTMLElement>('[data-trustmrr="name"]');if(name)name.textContent='Your startup';throw new Error('Add your TrustMRR token and startup slug in Settings.');}
        let request = pending.get(slug);
        if (!request) {request=invoke<TrustMRRStartup>('load_trustmrr_startup',{startupSlug:slug,refresh:force}).finally(()=>pending.delete(slug));pending.set(slug,request);}
        const startup = await request;
        if (!panel.isConnected) return;
        renderTrustMRR(panel,startup,settings.amountUnit);
        status.textContent = '';if(account)account.hidden=true;
    } catch(error) {
        if(account)account.hidden=false;
        if(panel.isConnected) status.textContent = typeof error==='string' ? error : error instanceof Error ? error.message : 'Could not load TrustMRR.';
    } finally {panel.removeAttribute('aria-busy');refresh.disabled=false;}
}
export function renderTrustMRR(root: HTMLElement,startup: TrustMRRStartup,amountUnit='usd'): void {
    const divisor=amountUnit==='cents'?100:1;
    const money=new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',minimumFractionDigits:2,maximumFractionDigits:2});
    const set=(field:string,value:string)=>{const el=root.querySelector<HTMLElement>(`[data-trustmrr="${field}"]`);if(el)el.textContent=value;};
    set('name',startup.name);
    set('last30Days',money.format(startup.revenue.last30Days/divisor));
    set('mrr',money.format(startup.revenue.mrr/divisor));
    set('total',money.format(startup.revenue.total/divisor));
    const image=root.querySelector<HTMLImageElement>('.trustmrr-startup-logo');
    if(image){
        image.hidden=true;image.removeAttribute('src');
        let fallback='';
        try{
            const site=new URL(startup.website||'');
            if(site.protocol==='https:'){
                const favicon=new URL('https://www.google.com/s2/favicons');
                favicon.searchParams.set('domain',site.hostname);favicon.searchParams.set('sz','64');fallback=favicon.href;
            }
        }catch{/* The API may omit the public website. */}
        const show=(src:string)=>{
            image.referrerPolicy='no-referrer';image.decoding='async';image.style.visibility='hidden';image.hidden=false;
            image.onload=()=>{image.style.visibility='visible';};
            image.onerror=()=>{if(fallback&&src!==fallback){show(fallback);}else{image.hidden=true;}};
            image.src=src;
        };
        try{
            const url=new URL(startup.icon||'');
            const allowed=['d21oz30g4w22sz.cloudfront.net','cdn.trustmrr.com','trustmrr.com','pbs.twimg.com','avatars.githubusercontent.com','files.stripe.com','img.logo.dev'];
            if(url.protocol==='https:'&&allowed.includes(url.hostname))show(url.href);
            else if(fallback)show(fallback);
        }catch{if(fallback)show(fallback);}
    }
    const extras=root.querySelector<HTMLElement>('.trustmrr-extra')!;extras.replaceChildren();
    for(const [label,value] of [['Customers',startup.customers],['Active subscriptions',startup.activeSubscriptions]] as const){
        if(value==null)continue;const row=document.createElement('div');const title=document.createElement('dt');title.textContent=label;const count=document.createElement('dd');count.textContent=value.toLocaleString();row.append(title,count);extras.append(row);
    }
    extras.hidden=!extras.children.length;
}

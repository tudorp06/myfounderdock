import {animateSections} from './motion';
import { getConnection,openAccountSettings } from './connections';
import { invoke } from '@tauri-apps/api/core';
interface UsageWindow { id:string; label:string; usedPercent:number; resetsAt:string|null; windowDurationMins:number|null }
interface AgentUsage { provider:string;plan:string|null;account:string|null;source:string;windows:UsageWindow[];tokens:{lifetimeTokens:number|null;peakDailyTokens:number|null;currentStreakDays:number|null}|null;periodStart:string|null;periodEnd:string|null;subscribedAt:string|null;lastChargeAt:string|null;renewsAt:string|null;billingSource?:string;updatedAt:number }
const pending=new Map<string,Promise<AgentUsage>>();
const names:Record<string,string>={codex:'Codex',claude:'Claude',cursor:'Cursor'};
function text(tag:string,value:string,className=''){const node=document.createElement(tag);node.textContent=value;node.className=className;return node;}
function when(value:string|null){
    if(!value)return null;
    const date=/^\d+$/.test(value)?new Date(Number(value)*(value.length>11?1:1000)):new Date(value);
    return Number.isFinite(date.getTime())?date:null;
}
function dateLabel(value:string|null){const date=when(value);return date?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(date):null;}
function billingCountdown(value:string|null){
 const date=when(value);if(!date)return '';
 const minutes=Math.ceil((date.getTime()-Date.now())/60000);
 if(minutes<0)return 'Date passed';if(minutes===0)return 'Due now';
 const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),remaining=minutes%60;
 return days?`in ${days} day${days===1?'':'s'} · ${hours}h`:hours?`in ${hours}h ${remaining}m`:`in ${remaining}m`;
}
function resetLabel(value:string|null){
    const date=when(value);if(!date)return 'Reset time unavailable';
    const left=date.getTime()-Date.now();
    if(left<=0)return 'Resetting';
    const minutes=Math.ceil(left/60000);
    if(minutes<60)return `Resets in ${minutes}m`;
    if(minutes<1440)return `Resets in ${Math.floor(minutes/60)}h ${minutes%60}m`;
    return 'Resets '+new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(date);
}
function planLabel(value:string|null){if(!value)return 'Account';return value.replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
async function load(provider:string,refresh:boolean){
    const config=await getConnection(provider);
    if(!config.enabled)throw 'Choose your account source in Settings to connect this provider.';
    const key=provider+':'+config.revision;
    let request=pending.get(key);
    if(!request){request=invoke<AgentUsage>('load_agent_usage',{provider,refresh}).finally(()=>pending.delete(key));pending.set(key,request);}
    return request;
}
export async function mountAgent(root:HTMLElement,provider:string):Promise<void>{
    const view=root.querySelector<HTMLElement>('.agent-view')!;
    const status=view.querySelector<HTMLElement>('.agent-status')!;
    const connect=view.querySelector<HTMLButtonElement>('.agent-connect')!;
    const refresh=root.querySelector<HTMLButtonElement>('.agent-refresh')!;
    const plan=root.querySelector<HTMLElement>('.agent-plan')!;
    const windows=view.querySelector<HTMLElement>('.usage-group')!;
    const billing=view.querySelector<HTMLElement>('.agent-billing')!;
    const metrics=view.querySelector<HTMLElement>('.agent-token-metrics')!;
    let revision=0;
    function renderBilling(data:Pick<AgentUsage,'plan'|'subscribedAt'|'lastChargeAt'|'renewsAt'|'periodStart'|'periodEnd'|'billingSource'>){
        billing.replaceChildren();
        const rows:[string,string|null][]=[['Plan',data.plan?planLabel(data.plan):null],['Subscribed',dateLabel(data.subscribedAt)],['Last charge',dateLabel(data.lastChargeAt)],['Next billing',dateLabel(data.renewsAt)]];
        if(data.periodStart)rows.push(['Period started',dateLabel(data.periodStart)]);
        if(data.periodEnd&&!data.renewsAt)rows.push(['Cycle ends',dateLabel(data.periodEnd)]);
        for(const[label,value]of rows){
            const row=document.createElement('div');const dd=text('dd',value||'\u2014');
            if(label==='Next billing'&&data.renewsAt){const countdown=text('small',billingCountdown(data.renewsAt),'billing-countdown');countdown.dataset.billingNext=data.renewsAt;const date=when(data.renewsAt);if(date)dd.title=date.toLocaleString();dd.append(countdown);}
            row.append(text('dt',label),dd);billing.append(row);
        }
        const note=view.querySelector<HTMLElement>('.agent-billing-note')!;
        note.hidden=false;
        if(data.billingSource==='settings')note.textContent='Includes dates from Settings.';
        else if(!data.subscribedAt&&!data.lastChargeAt&&!data.renewsAt)note.textContent='Set billing dates in Settings.';
        else note.hidden=true;
        root.querySelector<HTMLElement>('.agent-subscription')!.hidden=false;
    }
    if(typeof window.requestAnimationFrame==='function'){
        const timer=setInterval(()=>{
            if(!view.isConnected||root.hidden){clearInterval(timer);return;}
            view.querySelectorAll<HTMLElement>('[data-billing-next]').forEach(node=>node.textContent=billingCountdown(node.dataset.billingNext||null));
        },60000);
        root.addEventListener('panel-unmount',()=>clearInterval(timer),{once:true});
    }

    function render(data:AgentUsage){
        plan.textContent=planLabel(data.plan);
        windows.replaceChildren();
        for(const item of data.windows){
            const row=text('div','','usage-row');
            const heading=text('div','','usage-row-heading');
            const reset=text('span',resetLabel(item.resetsAt),'usage-reset');const resetDate=when(item.resetsAt);if(resetDate)reset.title=resetDate.toLocaleString();
            heading.append(text('span',item.label),reset,text('strong',item.usedPercent.toLocaleString(undefined,{maximumFractionDigits:1})+'%'));
            const track=text('div','','usage-track');track.setAttribute('role','meter');track.setAttribute('aria-label',item.label);track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(Math.min(100,Math.max(0,item.usedPercent))));track.setAttribute('aria-valuetext',item.usedPercent+'% used');
            const fill=text('span','','usage-fill');fill.style.width=Math.min(100,Math.max(0,item.usedPercent))+'%';track.append(fill);row.append(heading,track);windows.append(row);
        }
        if(!data.windows.length)windows.append(text('p','This account does not report a usage limit.','agent-note'));
        renderBilling(data);
        metrics.replaceChildren();
        if(data.tokens){for(const[label,value]of [['Lifetime tokens',data.tokens.lifetimeTokens],['Peak daily tokens',data.tokens.peakDailyTokens],['Current streak',data.tokens.currentStreakDays]]as const){if(value==null)continue;const item=document.createElement('div');const count=text('strong',new Intl.NumberFormat(undefined,{notation:value>=10000?'compact':'standard',maximumFractionDigits:1}).format(value)+(label==='Current streak'?' days':''));count.title=value.toLocaleString();item.append(count,text('span',label));metrics.append(item);}}
        metrics.hidden=!metrics.children.length;
        connect.textContent='Account settings';connect.hidden=true;status.textContent='';
        root.querySelector<HTMLElement>('.agent-subscription')!.hidden=false;
        root.querySelector<HTMLElement>('.agent-usage')!.hidden=false;
        if(!view.closest('.panel-data[hidden],.panel-preparing'))animateSections(view);
        document.querySelector(`[data-panel="${provider}"]`)?.setAttribute('aria-label',names[provider]+' usage');
    }
    async function refreshData(force=false){
        const current=++revision;refresh.disabled=true;connect.disabled=true;status.textContent='';view.setAttribute('aria-busy','true');
        try{if(!('__TAURI_INTERNALS__' in window))throw new Error('Open the desktop app to connect your account.');const data=await load(provider,force);if(view.isConnected&&current===revision)render(data);}
        catch(error){if(view.isConnected&&current===revision){status.textContent=typeof error==='string'?error:error instanceof Error?error.message:'Could not load account usage.';connect.textContent='Account settings';connect.hidden=false;}}
        finally{if(view.isConnected&&current===revision){refresh.disabled=false;connect.disabled=false;view.removeAttribute('aria-busy');}}
    }
    refresh.onclick=()=>void refreshData(true);
    connect.onclick=()=>openAccountSettings(provider);
    try{const config=await getConnection(provider);if(view.isConnected)renderBilling({plan:null,subscribedAt:config.subscribedAt||null,lastChargeAt:config.lastChargeAt||null,renewsAt:config.nextBillingAt||null,periodStart:null,periodEnd:null,billingSource:config.subscribedAt||config.lastChargeAt||config.nextBillingAt?'settings':'unavailable'});}catch{/* Main request will show the account error. */}
    await refreshData();
}

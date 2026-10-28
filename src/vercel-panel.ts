import { invoke } from '@tauri-apps/api/core';
import { getConnection,saveConnection,openAccountSettings,type Connection } from './connections';
interface Project {id:string;name:string}
interface Traffic {visitors:number;pageviews:number}
const cache=new Map<string,{at:number;data:Traffic}>();
export async function mountVercel(root:HTMLElement){
 const view=root.querySelector<HTMLElement>('.vercel-view')!;
 const picker=view.querySelector<HTMLSelectElement>('#project')!;
 const status=view.querySelector<HTMLElement>('.vercel-message')!;
 const refresh=root.querySelector<HTMLButtonElement>('.vercel-refresh')!;
 const visitors=view.querySelector<HTMLElement>('[data-metric="visitors"]')!;
 const pageviews=view.querySelector<HTMLElement>('[data-metric="pageviews"]')!;
 const settings=document.createElement('button');settings.className='quiet-action';settings.textContent='Account settings';settings.onclick=()=>openAccountSettings('vercel');view.append(settings);
 let config:Connection,revision=0;
 async function traffic(force=false){
  const current=++revision;visitors.textContent=pageviews.textContent='\u2014';if(!picker.value)return;
  status.textContent='Loading analytics...';
  try{
   if(config.projectId!==picker.value){config={...config,projectId:picker.value};await saveConnection('vercel',config,undefined,false,false);config=await getConnection('vercel');}
   const key=config.revision+':'+config.projectId;const stored=cache.get(key);
   const data=!force&&stored&&stored.at>Date.now()-60000?stored.data:await invoke<Traffic>('load_vercel_analytics',{projectId:config.projectId,teamId:config.teamId||null});
   cache.set(key,{at:Date.now(),data});if(!view.isConnected||current!==revision)return;
   visitors.textContent=data.visitors.toLocaleString();pageviews.textContent=data.pageviews.toLocaleString();status.textContent='Last 30 days · Production';
  }catch(error){if(view.isConnected&&current===revision)status.textContent=typeof error==='string'?error:'Could not load analytics.';}
 }
 async function load(force=false){
  refresh.disabled=true;picker.disabled=true;status.textContent='Loading projects...';
  try{
   config=await getConnection('vercel');if(!view.isConnected)return;
   if(!config.enabled||!config.hasToken)throw 'Add your Vercel token in Settings to connect your projects.';
   const projects=await invoke<Project[]>('load_vercel_projects',{teamId:config.teamId||null});if(!view.isConnected)return;
   picker.replaceChildren(...projects.map(p=>new Option(p.name,p.id)));
   if(projects.some(p=>p.id===config.projectId))picker.value=config.projectId;
   if(!projects.length){picker.add(new Option('No projects found',''));status.textContent='No projects found. Check your token scope and team in Settings.';return;}
   picker.disabled=false;await traffic(force);
  }catch(error){if(view.isConnected)status.textContent=typeof error==='string'?error:'Could not load Vercel.';}
  finally{if(view.isConnected)refresh.disabled=false;}
 }
 picker.onchange=()=>void traffic();refresh.onclick=()=>void load(true);await load();
}

import { invoke } from '@tauri-apps/api/core';
import { platforms } from './slots';
import { mountGitHub } from './github-panel';
export interface Connection {
 revision:number; subscribedAt?:string;lastChargeAt?:string;nextBillingAt?:string; enabled:boolean; username:string;teamId:string;projectId:string;startupSlug:string;amountUnit:string;cliPath:string;configDir:string;source:string;
 hasToken:boolean;detectedCliPath:string|null;sessionFound:boolean;
}
export function getConnection(provider:string):Promise<Connection>{
 if(!('__TAURI_INTERNALS__' in window))return Promise.resolve({revision:0,enabled:false,username:'',teamId:'',projectId:'',startupSlug:'',amountUnit:'usd',cliPath:'',configDir:'',source:'auto',hasToken:false,detectedCliPath:null,sessionFound:false});
 return invoke<Connection>('get_connection',{provider});
}
export async function saveConnection(provider:string,config:Connection,token?:string,clearToken=false,notify=true){
 const {enabled,username,teamId,projectId,startupSlug,amountUnit,cliPath,configDir,source}=config;
 const subscribedAt=config.subscribedAt||'',lastChargeAt=config.lastChargeAt||'',nextBillingAt=config.nextBillingAt||'';
 await invoke('save_connection',{provider,config:{enabled,username,teamId,projectId,startupSlug,amountUnit,cliPath,configDir,source,subscribedAt,lastChargeAt,nextBillingAt},token:token||null,clearToken});
 if(notify){const{emit}=await import('@tauri-apps/api/event');await emit('connections-changed',provider);}
}
export function openAccountSettings(provider:string){window.dispatchEvent(new CustomEvent('open-provider-settings',{detail:provider}));}
function msg(error:unknown){return typeof error==='string'?error:error instanceof Error?error.message:'Could not save this account.';}
export async function mountConfiguredGitHub(root:HTMLElement){
 const calendar=root.querySelector<HTMLElement>('.heatmap-section')!;const repos=root.querySelector<HTMLElement>('.repos-section')!;
 try{const c=await getConnection('github');if(!calendar.isConnected)return;if(!c.enabled||!c.username){calendar.replaceChildren();repos.replaceChildren();const p=document.createElement('p');p.className='github-message';p.textContent='Add your GitHub username in Settings.';const b=document.createElement('button');b.className='quiet-action';b.textContent='Configure GitHub';b.onclick=()=>openAccountSettings('github');calendar.append(p,b);return;}await mountGitHub(root,c.username);}
 catch(error){if(calendar.isConnected){calendar.textContent=msg(error);repos.replaceChildren();}}
}
const titles:Record<string,string>={github:'GitHub',vercel:'Vercel',polar:'Polar',trustmrr:'TrustMRR',stripe:'Stripe',codex:'Codex',claude:'Claude',cursor:'Cursor'};
const tokenProviders=['vercel','polar','trustmrr','stripe'];
const agents=['codex','claude','cursor'];
const links:Record<string,string>={vercel:'https://vercel.com/account/tokens',polar:'https://polar.sh/dashboard',trustmrr:'https://trustmrr.com/docs/api',stripe:'https://dashboard.stripe.com/apikeys'};
export async function mountConnectionSettings(root:HTMLElement,provider:string){
 const p=platforms.find(item=>item.id===provider)!;
 root.innerHTML=`<h1>${titles[provider]}</h1><div class="settings-group integration-summary"><span class="integration-logo"><img src="${p.logo}" class="${p.logoClass}" alt=""></span><div><strong>${titles[provider]}</strong><p class="connection-summary">Loading configuration...</p></div></div><form class="settings-group connection-editor provider-config"><div class="connection-fields"></div><p class="connection-status group-note" role="status"></p><div class="account-actions"><button class="quiet-button connection-save" type="submit">Save and connect</button><button class="quiet-button connection-test" type="button">Test connection</button><button class="text-button connection-disconnect" type="button">Disconnect</button></div></form>`;
 const form=root.querySelector<HTMLFormElement>('form')!;const fields=form.querySelector<HTMLElement>('.connection-fields')!;const status=form.querySelector<HTMLElement>('.connection-status')!;const summary=root.querySelector<HTMLElement>('.connection-summary')!;
 let config:Connection;
 try{config=await getConnection(provider);if(!form.isConnected)return;}catch(error){status.textContent=msg(error);return;}
 function input(id:string,label:string,type='text',placeholder=''){
  const wrapper=document.createElement('label');wrapper.className='profile-field';wrapper.htmlFor=id;wrapper.append(document.createTextNode(label));const el=document.createElement('input');el.id=id;el.type=type;el.autocomplete=type==='password'?'new-password':'off';el.spellcheck=false;el.placeholder=placeholder;wrapper.append(el);fields.append(wrapper);return el;
 }
 function select(id:string,label:string,choices:[string,string][]){const wrapper=document.createElement('label');wrapper.className='profile-field';wrapper.htmlFor=id;wrapper.append(document.createTextNode(label));const el=document.createElement('select');el.id=id;el.append(...choices.map(([value,text])=>new Option(text,value)));wrapper.append(el);fields.append(wrapper);return el;}
 function note(text:string){const p=document.createElement('p');p.className='group-note';p.textContent=text;fields.append(p);}
 const token=tokenProviders.includes(provider)?input('provider-token','API token','password',config.hasToken?'Token saved securely - enter a new one to replace it':'Paste your API token'):null;
 if(token){const link=document.createElement('a');link.className='token-help';link.href=links[provider];link.target='_blank';link.rel='noopener noreferrer';link.textContent='Where to create a token';link.onclick=async(event)=>{if('__TAURI_INTERNALS__' in window){event.preventDefault();await invoke('open_provider_help',{provider});}};fields.append(link);note('Saved with Windows encryption. Your token is never shown again.');}
 const username=provider==='github'?input('github-username','GitHub username','text','your-username'):null;if(username){username.value=config.username;note('Shows public contributions and your three most recently pushed repositories.');}
 const team=provider==='vercel'?input('vercel-team','Team ID (optional)','text','team_...'):null;if(team)team.value=config.teamId;
 const project=provider==='vercel'?select('vercel-project','Project',[['','Load your projects after saving a token']]):null;
 const slug=provider==='trustmrr'?input('trustmrr-slug','Startup slug','text','your-startup'):null;if(slug){slug.value=config.startupSlug;note('Use the slug after /startup/ in the TrustMRR URL.');}
 const unit=provider==='trustmrr'?select('trustmrr-unit','Amounts returned by your API',[['usd','US dollars'],['cents','US cents']]):null;if(unit)unit.value=config.amountUnit||'usd';
 const source=provider==='cursor'?select('account-source','Account source',[['auto','Detect existing Cursor account'],['editor','Cursor editor account'],['cli','Cursor Agent account']]):null;if(source)source.value=config.source||'auto';
 let cli:HTMLInputElement|null=null,dir:HTMLInputElement|null=null,login:HTMLButtonElement|null=null;
 let cliStatus:HTMLElement|null=null;
 const existing=form.querySelector<HTMLButtonElement>('.connection-save')!;
 if(agents.includes(provider)){
  const detection=document.createElement('div');detection.className='cli-detection';
  cliStatus=document.createElement('p');cliStatus.className='group-note';
  const detect=document.createElement('button');detect.type='button';detect.className='quiet-button';detect.textContent='Detect CLI';
  detection.append(cliStatus,detect);fields.append(detection);
  const advanced=document.createElement('details');advanced.className='connection-advanced';
  const label=document.createElement('summary');label.textContent='Advanced';advanced.append(label);fields.append(advanced);
  cli=input('provider-cli','CLI executable override','text','Detected automatically');cli.value=config.cliPath;advanced.append(cli.parentElement!);
  if(['codex','claude'].includes(provider)){dir=input('provider-profile','Profile folder override','text','Use the standard profile folder');dir.value=config.configDir;advanced.append(dir.parentElement!);}
  login=document.createElement('button');login.type='button';login.className='quiet-button connection-login';login.textContent='Sign in with '+titles[provider];
  form.querySelector('.account-actions')!.prepend(login);
  existing.textContent='Use existing sign-in';existing.hidden=!config.sessionFound;
  function detectionLabel(){
   if(cliStatus)cliStatus.textContent=config.detectedCliPath?'CLI detected'+(config.sessionFound?' · Existing sign-in found':''):'CLI not found. Install it, then detect again.';
   existing.hidden=!config.sessionFound;
  }
  detectionLabel();
  detect.onclick=async()=>{detect.disabled=true;try{const found=await getConnection(provider);config={...config,detectedCliPath:found.detectedCliPath,sessionFound:found.sessionFound};detectionLabel();status.textContent=found.detectedCliPath?'CLI detected. You can sign in.':'Install the '+titles[provider]+' CLI, then choose Detect CLI.';}catch(error){status.textContent=msg(error);}finally{detect.disabled=false;}};
 }
 let subscribed:HTMLInputElement|null=null,lastCharge:HTMLInputElement|null=null,nextBilling:HTMLInputElement|null=null;
 function localDate(value:string|undefined){if(!value)return '';const d=new Date(value);return Number.isFinite(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';}
 if(agents.includes(provider)){
  const heading=document.createElement('h2');heading.className='billing-settings-heading';heading.textContent='Subscription dates (optional)';fields.append(heading);
  note('Used when the provider does not share billing dates.');
  subscribed=input('subscription-started','Subscription started','datetime-local');subscribed.value=localDate(config.subscribedAt);
  lastCharge=input('last-charge','Last payment','datetime-local');lastCharge.value=localDate(config.lastChargeAt);
  nextBilling=input('next-billing','Next billing','datetime-local');nextBilling.value=localDate(config.nextBillingAt);
 }
 if(provider==='stripe')note('Token configuration is available. Stripe statistics will be added separately.');
 function updateSummary(){summary.textContent=config.enabled?(config.hasToken?'Token saved securely':'Configuration saved'):'Not connected';}
 updateSummary();
 function iso(input:HTMLInputElement|null,previous:string|undefined){return input?(input.value?new Date(input.value).toISOString():''):previous||'';}
 function values():Connection{return {subscribedAt:iso(subscribed,config.subscribedAt),lastChargeAt:iso(lastCharge,config.lastChargeAt),nextBillingAt:iso(nextBilling,config.nextBillingAt),...config,enabled:true,username:username?.value.trim()??config.username,teamId:team?.value.trim()??config.teamId,projectId:project?.value??config.projectId,startupSlug:slug?.value.trim().toLowerCase()??config.startupSlug,amountUnit:unit?.value??config.amountUnit,source:source?.value??config.source,cliPath:cli?.value.trim()??config.cliPath,configDir:dir?.value.trim()??config.configDir};}
 async function listProjects(){if(!project)return;project.disabled=true;try{const list=await invoke<{id:string;name:string}[]>('load_vercel_projects',{teamId:config.teamId||null});if(!project.isConnected)return;project.replaceChildren(...list.map(p=>new Option(p.name,p.id)));if(list.some(p=>p.id===config.projectId))project.value=config.projectId;project.disabled=!list.length;if(!list.length)project.add(new Option('No projects found - check the team scope',''));}catch(error){throw error;} }
 async function persist(){const next=values();if(username&&!next.username)throw new Error('Enter your GitHub username.');if(slug&&!next.startupSlug)throw new Error('Enter your startup slug.');if(token&&!token.value.trim()&&!config.hasToken)throw new Error('Enter an API token.');await saveConnection(provider,next,token?.value);config=await getConnection(provider);if(token){token.value='';token.placeholder='Token saved securely - enter a new one to replace it';}updateSummary();}
 async function test(){
  if(provider==='github'){const response=await fetch(`https://api.github.com/users/${encodeURIComponent(config.username)}`);if(!response.ok)throw new Error(`GitHub could not find that public account (${response.status}).`);return 'GitHub account found.';}
  if(provider==='vercel'){await listProjects();return 'Project list refreshed.';}
  if(provider==='polar'){const data=await invoke<unknown[]>('load_polar_orders',{productId:null});return `Connected. ${data.length} recent paid orders.`;}
  if(provider==='trustmrr'){const data=await invoke<{name:string}>('load_trustmrr_startup',{startupSlug:config.startupSlug});return `Connected to ${data.name}.`;}
  if(agents.includes(provider)){const data=await invoke<{plan:string|null;source:string}>('load_agent_usage',{provider,refresh:true});return `Connected${data.plan?' · '+data.plan:''} · ${data.source}`;}
  return 'Configuration saved. Stripe statistics are not implemented yet.';
 }
 function busy(value:boolean){form.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=value);}
 form.onsubmit=async(event)=>{event.preventDefault();busy(true);status.textContent='Saving...';try{await persist();status.textContent=await test();}catch(error){status.textContent=msg(error);}finally{if(form.isConnected)busy(false);}};
 form.querySelector<HTMLButtonElement>('.connection-test')!.onclick=async()=>{busy(true);status.textContent='Testing...';try{await persist();status.textContent=await test();}catch(error){status.textContent=msg(error);}finally{if(form.isConnected)busy(false);}};
 form.querySelector<HTMLButtonElement>('.connection-disconnect')!.onclick=async()=>{busy(true);try{config={...config,enabled:false,hasToken:false};await saveConnection(provider,config,undefined,true);if(token){token.value='';token.placeholder='Paste your API token';}updateSummary();status.textContent='Disconnected from this app. Your provider account is unchanged.';}catch(error){status.textContent=msg(error);}finally{if(form.isConnected)busy(false);}};
 if(login)login.onclick=async()=>{busy(true);try{await persist();status.textContent='Finish signing in in your browser...';await invoke('login_agent',{provider});config=await getConnection(provider);if(source)source.value=config.source||'auto';existing.hidden=!config.sessionFound;status.textContent=await test();}catch(error){status.textContent=msg(error);}finally{if(form.isConnected)busy(false);}};
 if(project){project.onchange=async()=>{try{config={...config,projectId:project.value};await saveConnection(provider,config);status.textContent='Project saved.';}catch(error){status.textContent=msg(error);}};if(config.enabled&&config.hasToken)void listProjects().catch(error=>{status.textContent=msg(error);});}
}

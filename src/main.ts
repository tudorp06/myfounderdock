import {transitionPanel,panelEase} from './motion';
import './style.css';

import { platforms, agents, type Panel } from './slots';

import { mountConfiguredGitHub } from './connections';
import { mountPolar } from './polar-panel';
import { mountVercel } from './vercel-panel';
import { mountTrustMRR } from './trustmrr-panel';
import { mountAgent } from './agent-panel';

import { readPreferences } from './preferences';

import { readProfile } from './profile';

import { createDockPositioning } from './dock-position';





const native = '__TAURI_INTERNALS__' in window;

const app = document.querySelector<HTMLElement>('#app')!;

document.documentElement.classList.toggle('native', native);

let preferences = readPreferences();

let selected: Panel | null = null;
let pendingPanel: Panel | null = null;

let closeTimer: ReturnType<typeof setTimeout> | undefined;

let transition = 0;

let switchAnimation: Animation | undefined;
let heightAnimation: Animation | undefined;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let measuredHeight = 0;

const refreshIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg>';

const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';

const personIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';

const gear = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 3-.6 2.3-2 .9-2.2-.6-2 3.4 1.6 1.7v2.5L2.2 15l2 3.4 2.2-.6 2 .9L9 21h4l.6-2.3 2-.9 2.2.6 2-3.4-1.6-1.8v-2.5l1.6-1.7-2-3.4-2.2.6-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/></svg>';



app.innerHTML = `<section class="dock" aria-label="Platforms">

  <aside id="detail" class="detail" aria-label="Platform details" hidden></aside>

  <nav class="rail" aria-label="Your platforms">

    ${platforms.map(platform => `<button class="platform" data-panel="${platform.id}" aria-label="${platform.name}${platform.id === 'github' ? ' activity' : ', not connected'}" aria-controls="detail" aria-expanded="false" style="--accent:${'accent' in platform ? platform.accent : '#c2d4f3'}"><span class="ring">${platform.logo ? `<img class="platform-logo ${platform.logoClass}" src="${platform.logo}" alt="">` : '<span class="logo-slot" aria-hidden="true"></span>'}</span><span class="platform-tooltip">${platform.name}</span></button>`).join('')}

    <button class="platform personal-platform" data-panel="profile" aria-label="Your profile" aria-controls="detail" aria-expanded="false"><span class="ring personal-avatar">${personIcon}</span><span class="platform-tooltip">Your profile</span></button>

    <span class="rail-divider" aria-hidden="true"></span>

    <button class="settings-button" aria-label="Open settings">${gear}</button>

  </nav>

</section>`;

const detail = document.querySelector<HTMLElement>('#detail')!;

const dock = document.querySelector<HTMLElement>('.dock')!;

const positioning = createDockPositioning(dock, {

  native, floating: () => preferences.dockMode === 'floating', motion: () => !reducedMotion(),

  beforeDrag: () => {

    detail.querySelector('.panel-content')?.dispatchEvent(new Event('panel-unmount'));clearTimeout(closeTimer);clearTimeout(hoverTimer);transition++;selected=null;pendingPanel=null;switchAnimation?.cancel();heightAnimation?.cancel();detail.style.height='';contentObserver.disconnect();

    dock.classList.remove('expanded');detail.hidden=true;

    document.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-expanded','false'));

  },

});

function header(title: string, subtitle: string) {

  return `<header class="panel-header"><div><h1>${title}</h1><p>${subtitle}</p></div><button class="icon-button close" aria-label="Close panel">${closeIcon}</button></header>`;

}



function panelContent(panel: Panel) {

  const agent = agents.find(item => item.id === panel);

  if (agent) {
    return `<header class="agent-header"><div class="agent-identity"><img src="${agent.logo}" class="${agent.logoClass}" alt=""><h1>${agent.name}</h1><span class="agent-plan">Account</span></div><div class="polar-actions"><button class="agent-refresh icon-button" aria-label="Refresh ${agent.name} usage">${refreshIcon}</button><button class="icon-button close" aria-label="Close panel">${closeIcon}</button></div></header><div class="agent-view"><section class="agent-usage" aria-label="${agent.name} usage" hidden><h2 class="group-label">Usage</h2><div class="usage-group"></div></section><section class="agent-token-metrics" aria-label="Token activity" hidden></section><section class="agent-subscription" aria-label="Subscription" hidden><h2 class="group-label">Subscription</h2><dl class="subscription-rows agent-billing"></dl><p class="agent-billing-note agent-note">Billing dates aren't provided by this connection.</p></section><footer class="agent-controls"><p class="agent-status" role="status">Loading account...</p><button class="agent-connect quiet-action">Connect ${agent.name}</button></footer></div>`;
  }

  if (panel === 'profile') return `${header('Your space', '')}<div class="personal-card"><div class="personal-photo"></div><h2 class="personal-name"></h2><p class="personal-note"></p></div><button class="edit-profile quiet-action">Edit profile</button>`;

  if (panel === 'github') return `<header class="panel-header github-panel-header"><h1 class="sr-only">GitHub</h1><img class="github-header-logo invert-logo" src="/logos/github.png" alt=""><button class="icon-button close" aria-label="Close panel">${closeIcon}</button></header>

    <div id="github-profile" class="github-profile" hidden>

      <img id="github-avatar" src="/logos/github.png" width="28" height="28" alt="">

      <div><strong id="github-name"></strong><span id="github-login"></span></div>

    </div>

    <section class="heatmap-section" aria-label="GitHub contributions"></section>

    <section class="repos-section" aria-label="Recent repositories"></section>

    <footer class="connection github-source">Public activity · <a href="https://github.com/grubersjoe/github-contributions-api" target="_blank" rel="noopener noreferrer">Calendar source</a></footer>`;

  if (panel === 'trustmrr') return `<header class="panel-header trustmrr-header"><div class="vercel-identity"><img src="/logos/trustmrr.png" alt="" width="20" height="20"><h1>TrustMRR</h1></div><div class="polar-actions"><button class="trustmrr-refresh icon-button" aria-label="Refresh revenue">${refreshIcon}</button><button class="icon-button close" aria-label="Close panel">${closeIcon}</button></div></header><section class="trustmrr-view" aria-label="Startup revenue"><div class="trustmrr-startup"><img class="trustmrr-startup-logo" alt="" width="28" height="28" hidden><h2 data-trustmrr="name">Loading startup...</h2></div><div class="trustmrr-hero"><span>Revenue · last 30 days</span><strong data-trustmrr="last30Days">&mdash;</strong></div><dl class="trustmrr-secondary"><div><dt>Monthly recurring</dt><dd data-trustmrr="mrr">&mdash;</dd></div><div><dt>All-time revenue</dt><dd data-trustmrr="total">&mdash;</dd></div></dl><dl class="trustmrr-extra" hidden></dl><p class="trustmrr-message" role="status"></p></section>`;

  if (panel === 'polar') return `<header class="polar-header"><div class="polar-heading"><h1>Purchases</h1></div><div class="polar-actions"><button class="polar-refresh icon-button" aria-label="Refresh purchases">${refreshIcon}</button><button class="icon-button close" aria-label="Close panel">${closeIcon}</button></div></header><section class="polar-view" aria-label="Polar purchases"><div class="polar-toolbar"><label class="sr-only" for="polar-product">Product</label><select id="polar-product" class="polar-product" disabled><option>All products</option></select><span class="purchase-count"></span></div><p class="polar-message" role="status"></p><ol class="purchase-list"></ol></section>`;

  if(panel==='stripe')return `${header('Stripe','')}<p class="empty-inline">Configure your Stripe token in Settings. Stripe statistics are coming later.</p>`;

  return `<header class="panel-header"><div class="vercel-identity"><img src="/logos/vercel.svg" alt="" width="18" height="18"><div><h1>Vercel</h1><p>Website analytics</p></div></div><div class="polar-actions"><button class="vercel-refresh icon-button" aria-label="Refresh Vercel analytics">${refreshIcon}</button><button class="icon-button close" aria-label="Close panel">${closeIcon}</button></div></header><div class="vercel-view"><section class="project-section"><label for="project">Project</label><select id="project" disabled><option>Select project</option></select></section><section class="analytics-section"><div class="analytics-metrics"><div><h2>Visitors</h2><span data-metric="visitors">&mdash;</span></div><div><h2>Page views</h2><span data-metric="pageviews">&mdash;</span></div></div><p class="vercel-message empty-inline" role="status"></p></section></div>`;

}

function applyProfile() {

  const profile = readProfile();

  const avatar = document.querySelector<HTMLElement>('.personal-avatar')!;
  avatar.replaceChildren();
  if(profile.photo){const image=document.createElement('img');image.src=profile.photo;image.alt='';avatar.append(image);}
  else avatar.innerHTML=personIcon;

  const card = detail.querySelector('.personal-card');

  if (card) {

    const photo = card.querySelector('.personal-photo')!; photo.replaceChildren();

    if (profile.photo) { const image = document.createElement('img'); image.src = profile.photo; image.alt = ''; photo.append(image); }

    else photo.innerHTML = personIcon;

    card.querySelector('.personal-name')!.textContent = profile.name || 'Your space';

    card.querySelector('.personal-note')!.textContent = profile.note || 'Add a photo and a short note in Settings.';

  }

}

applyProfile();

window.addEventListener('storage', applyProfile);

if (native) void import('@tauri-apps/api/event').then(({ listen }) => listen('profile-changed', applyProfile));

function reducedMotion() { return !preferences.motion || matchMedia('(prefers-reduced-motion: reduce)').matches; }

function applyPreferences() {

  preferences = readPreferences();

  dock.classList.toggle('solid', !preferences.glass);

  dock.dataset.mode = preferences.dockMode;

  dock.querySelectorAll<HTMLButtonElement>('.platform[data-panel]').forEach(button=>{
    button.hidden=button.dataset.panel!=='profile' && preferences.hiddenPlatforms.includes(button.dataset.panel!);
  });
  if(selected && preferences.hiddenPlatforms.includes(selected))void hidePanel();
  else void resizeNative(selected !== null).catch(error => console.error('Unable to resize dock', error));

  document.documentElement.classList.toggle('no-motion', !preferences.motion);

}

applyPreferences();

window.addEventListener('storage', applyPreferences);

if (native) void import('@tauri-apps/api/event').then(({ listen }) => listen('appearance-changed', applyPreferences));

async function resizeNative(expanded: boolean) {

  await positioning.resize(expanded);

}

// Animate intrinsic panel-size changes, including GitHub data arriving after opening.
function easePanelHeight(from: number, to: number) {
  heightAnimation?.cancel();
  measuredHeight = to;
  if (reducedMotion() || Math.abs(from-to)<1) return;
  detail.style.overflow = 'hidden';
  const animation = detail.animate([{height:`${from}px`},{height:`${to}px`}], {
    duration:600, easing:panelEase,
  });
  heightAnimation = animation;
  void animation.finished.catch(()=>{}).finally(()=>{
    if(heightAnimation===animation){heightAnimation=undefined;detail.style.overflow='';}
  });
}
const contentObserver = new ResizeObserver(()=>{
  const content = detail.querySelector<HTMLElement>('.panel-content');
  if(!content || detail.hidden || !selected) return;
  const style=getComputedStyle(detail);
  const natural=content.getBoundingClientRect().height+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
  const target=Math.min(natural,parseFloat(style.maxHeight)||natural);
  if(measuredHeight && Math.abs(target-measuredHeight)>1)easePanelHeight(heightAnimation?detail.getBoundingClientRect().height:measuredHeight,target);
  else measuredHeight=target;
});
async function showPanel(panel: Panel, force = false) {
  clearTimeout(closeTimer);clearTimeout(hoverTimer);
  if(positioning.isDragging())return;
  if(pendingPanel===panel&&!force)return;
  if(selected===panel&&!detail.hidden&&!pendingPanel&&!force)return;
  const current=++transition;
  pendingPanel=panel;selected=null;
  contentObserver.disconnect();
  detail.querySelector('.panel-content')?.dispatchEvent(new Event('panel-unmount'));
  detail.dispatchEvent(new Event('panel-unmount'));
  heightAnimation?.cancel();heightAnimation=undefined;detail.style.overflow='';
  dock.classList.remove('expanded');
  document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button=>{
    button.setAttribute('aria-expanded','false');
    if(button.dataset.panel===panel)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');
  });
  if(!detail.hidden)await new Promise(resolve=>setTimeout(resolve,reducedMotion()?0:240));
  if(current!==transition)return;
  detail.hidden=true;detail.replaceChildren();detail.style.height='';
  try{await resizeNative(true);}catch(error){console.error('Unable to expand dock',error);if(current===transition)pendingPanel=null;return;}
  if(current!==transition)return;
  detail.dataset.view=panel;
  const content=document.createElement('div');content.className='panel-content panel-preparing';content.innerHTML=panelContent(panel);detail.append(content);
  if(panel==='profile'){applyProfile();content.querySelector('.edit-profile')?.addEventListener('click',()=>void openSettings('profile'));}
  content.querySelector('.close')?.addEventListener('click',()=>void hidePanel(true));
  // Mount into this request's own subtree. A late response cannot query a newer panel.
  try{
    if(panel==='github')await mountConfiguredGitHub(content);
    else if(panel==='polar')await mountPolar(content);
    else if(panel==='vercel')await mountVercel(content);
    else if(panel==='trustmrr')await mountTrustMRR(content);
    else if(agents.some(agent=>agent.id===panel))await mountAgent(content,panel);
  }catch(error){console.error('Could not load panel',error);}
  if(current!==transition||pendingPanel!==panel||!content.isConnected)return;
  selected=panel;pendingPanel=null;content.classList.remove('panel-preparing');
  detail.hidden=false;measuredHeight=detail.offsetHeight;
  document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button=>{
    button.setAttribute('aria-expanded',String(button.dataset.panel===panel));button.removeAttribute('aria-busy');
  });
  // Establish the closed CSS state before opening, even for an immediate cache hit.
  void detail.offsetHeight;
  requestAnimationFrame(()=>{
    if(current!==transition||selected!==panel)return;
    dock.classList.add('expanded');transitionPanel(content);contentObserver.observe(content);
  });
}
async function hidePanel(restoreFocus = false) {
  pendingPanel=null;
  detail.querySelector('.panel-content')?.dispatchEvent(new Event('panel-unmount'));
  detail.dispatchEvent(new Event('panel-unmount'));

  clearTimeout(hoverTimer);
  contentObserver.disconnect();
  heightAnimation?.cancel();heightAnimation=undefined;detail.style.overflow='';
  const previous = selected;

  const current = ++transition;

  selected = null;

  switchAnimation?.cancel();

  dock.classList.remove('expanded');

  document.querySelectorAll('[data-panel]').forEach(button => {button.setAttribute('aria-expanded', 'false');button.removeAttribute('aria-busy');});

  if (restoreFocus && previous) document.querySelector<HTMLButtonElement>(`[data-panel="${previous}"]`)?.focus();

  await new Promise(resolve => setTimeout(resolve, reducedMotion() ? 0 : 260));

  if (current !== transition) return;

  detail.hidden = true;detail.style.height='';

  try { await resizeNative(false); } catch (error) { console.error('Unable to collapse dock', error); }

}

async function openSettings(section = 'general') {

  await hidePanel();

  if (!native) { window.open(`/settings.html#${section}`, 'founderdock-settings', 'width=760,height=540'); return; }

  try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('open_settings'); const { emit } = await import('@tauri-apps/api/event'); await emit('settings-section', section); }

  catch (error) { console.error('Unable to open settings', error); }

}

document.querySelector('.settings-button')?.addEventListener('click', () => void openSettings());

document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button => {

  button.addEventListener('click', () => void showPanel(button.dataset.panel as Panel));

  button.addEventListener('pointerenter', event => { if(event.pointerType==='mouse'){clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>void showPanel(button.dataset.panel as Panel),85);} });
  button.addEventListener('pointerleave',()=>clearTimeout(hoverTimer));

});

dock.addEventListener('pointerenter', () => clearTimeout(closeTimer));

dock.addEventListener('pointerleave', () => { if (!positioning.isDragging() && !preferences.pinned && !dock.contains(document.activeElement)) closeTimer = setTimeout(() => void hidePanel(), 280); });

dock.addEventListener('focusout', () => { setTimeout(() => { if (!positioning.isDragging() && !preferences.pinned && !dock.matches(':hover') && !dock.contains(document.activeElement)) void hidePanel(); }, 0); });

document.addEventListener('keydown', event => { if (event.key === 'Escape') void hidePanel(true); });

document.addEventListener('pointerdown', event => { if (!dock.querySelector('.rail')!.contains(event.target as Node) && !detail.contains(event.target as Node) && (selected||pendingPanel)) void hidePanel(); });


if(native)void import('@tauri-apps/api/event').then(({listen})=>listen('vercel-changed',()=>{if(selected==='vercel')detail.querySelector<HTMLButtonElement>('.vercel-refresh')?.click();}));

if(native)void import('@tauri-apps/api/event').then(({listen})=>listen('trustmrr-changed',()=>{if(selected==='trustmrr')void mountTrustMRR(detail);}));

window.addEventListener('open-provider-settings',event=>void openSettings((event as CustomEvent<string>).detail));
if(native)void import('@tauri-apps/api/event').then(({listen})=>listen<string>('connections-changed',event=>{if(selected===event.payload)void showPanel(selected,true);}));

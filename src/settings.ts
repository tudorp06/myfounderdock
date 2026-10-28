import { mountConnectionSettings } from './connections';
import './settings.css';
import { platforms } from './slots';

const settingsPlatforms = platforms;
import { readPreferences, savePreferences } from './preferences';
import { readProfile, saveProfile } from './profile';
const native = '__TAURI_INTERNALS__' in window;
const app = document.querySelector<HTMLElement>('#settings-app')!;
let preferences = readPreferences();
let selected = ['general', 'profile', 'about', ...settingsPlatforms.map(item => item.id)].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'general';
const gear = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 3-.6 2.3-2 .9-2.2-.6-2 3.4 1.6 1.7v2.5L2.2 15l2 3.4 2.2-.6 2 .9L9 21h4l.6-2.3 2-.9 2.2.6 2-3.4-1.6-1.8v-2.5l1.6-1.7-2-3.4-2.2.6-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/></svg>';
const info = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z"></path></svg>';
app.innerHTML = `<header class="window-bar" data-tauri-drag-region><span class="window-brand" data-tauri-drag-region><img src="/brand/app-icon.png" alt="" draggable="false" data-tauri-drag-region><span data-tauri-drag-region>myfounderdock Settings</span></span><button id="close-settings" aria-label="Close settings"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
  <div class="settings-layout"><nav class="sidebar" aria-label="Settings sections">
    <button class="nav-item" data-section="general">${gear}<span>General</span></button>
    <button class="nav-item" data-section="profile"><span class="nav-icon"><img class="invert-logo" src="/logos/user-circle.svg" alt=""></span><span>Your profile</span></button>
    <p class="nav-heading">Platforms</p>
    ${settingsPlatforms.map(platform => `<button class="nav-item" data-section="${platform.id}"><span class="nav-icon">${platform.logo ? `<img class="${platform.logoClass}" src="${platform.logo}" alt="">` : '<span class="empty-icon" aria-hidden="true"></span>'}</span><span>${platform.name}</span></button>`).join('')}
    <div class="sidebar-bottom"><button class="nav-item" data-section="about">${info}<span>About</span></button></div>
  </nav><main class="settings-content" id="settings-content"></main></div>`;
const content = document.querySelector<HTMLElement>('#settings-content')!;
function toggle(id: 'glass' | 'pinned' | 'motion', title: string, description: string) {
  return `<label class="preference-row"><span>${title}<small>${description}</small></span><input type="checkbox" role="switch" data-preference="${id}" ${preferences[id] ? 'checked' : ''}></label>`;
}
function bindProfileEditor() {
  let profile = readProfile();
  const name = content.querySelector<HTMLInputElement>('#profile-name')!;
  const note = content.querySelector<HTMLTextAreaElement>('#profile-note')!;
  const preview = content.querySelector<HTMLElement>('#photo-preview')!;
  const status = content.querySelector<HTMLElement>('#profile-save-status')!;
  name.value = profile.name; note.value = profile.note;
  const paint = () => {
    preview.replaceChildren();
    if (profile.photo) { const image = document.createElement('img'); image.src = profile.photo; image.alt = 'Your selected photo'; preview.append(image); }
    else preview.textContent = 'No photo';
  };
  const persist = async () => {
    profile = { ...profile, name: name.value, note: note.value };
    try { await saveProfile(profile); status.textContent = 'Saved on this device.'; }
    catch { status.textContent = 'Could not save. Try a smaller photo.'; }
  };
  name.addEventListener('input', () => void persist()); note.addEventListener('input', () => void persist());
  content.querySelector('#choose-photo')!.addEventListener('click', () => content.querySelector<HTMLInputElement>('#profile-photo')!.click());
  content.querySelector('#remove-photo')!.addEventListener('click', () => { profile.photo = ''; paint(); void persist(); });
  content.querySelector<HTMLInputElement>('#profile-photo')!.addEventListener('change', async event => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      status.textContent = 'Choose a PNG, JPEG, WebP or AVIF photo smaller than 2 MB.'; return;
    }
    const reader = new FileReader();
    reader.onload = () => { profile.photo = String(reader.result); paint(); void persist(); };
    reader.onerror = () => { status.textContent = 'Could not read that photo. Try another image.'; };
    reader.readAsDataURL(file);
  });
  paint();
}
function render() {
  document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button => {
    const active = button.dataset.section === selected;
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  if (selected === 'general') content.innerHTML = `<h1>General</h1><section aria-labelledby="appearance-title"><h2 id="appearance-title">Appearance</h2><div class="settings-group"><fieldset class="dock-mode-field"><legend>Dock shape</legend><div class="dock-mode-options"><label><input type="radio" name="dock-mode" value="floating" ${preferences.dockMode === 'floating' ? 'checked' : ''}><span class="mode-illustration floating-mode" aria-hidden="true"><i></i></span><strong>Floating pill</strong><small>A rounded capsule off the edge.</small></label><label><input type="radio" name="dock-mode" value="edge" ${preferences.dockMode === 'edge' ? 'checked' : ''}><span class="mode-illustration edge-mode" aria-hidden="true"><i></i></span><strong>Edge dock</strong><small>A smooth shape joined to the side.</small></label></div></fieldset>${toggle('glass', 'Glass panels', 'Let a little of your desktop show through.')}${toggle('motion', 'Panel animation', 'Smooth opening and switching between platforms.')}</div><p class="group-note">Your system’s reduced-motion preference is always respected.</p></section><section aria-labelledby="behavior-title"><h2 id="behavior-title">Behavior</h2><div class="settings-group">${toggle('pinned', 'Keep panel open', 'Close it yourself instead of closing on pointer leave.')}<div class="preference-row"><span>Dock position</span><span class="row-value">Drag to any side</span></div></div></section><div class="settings-footer"><span>Changes save automatically</span>${native ? '<button class="quiet-button" id="quit-dock">Quit myfounderdock</button>' : '<a href="/">Back to dock</a>'}</div>`;
  else if (selected === 'profile') {
    content.innerHTML = `<h1>Your profile</h1><p class="body-copy">Personalize your dock however you like. Change your photo, display name, and note.</p><div class="settings-group profile-editor"><div class="photo-editor"><div id="photo-preview" class="photo-preview"></div><div><button class="quiet-button photo-picker" id="choose-photo">Choose photo</button><input id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp,image/avif" hidden><button class="text-button" id="remove-photo">Remove</button><p class="group-note">PNG, JPEG, WebP or AVIF · up to 2 MB</p></div></div><label class="profile-field" for="profile-name">Display name<input id="profile-name" maxlength="40" autocomplete="off" placeholder="Your name"></label><label class="profile-field" for="profile-note">Your note<textarea id="profile-note" maxlength="280" rows="4" placeholder="A reminder, a goal, or a few words to make this yours."></textarea></label><p id="profile-save-status" class="group-note" role="status">Changes save automatically.</p></div>`;
    bindProfileEditor();
  }
  else if (platforms.some(provider=>provider.id===selected)) {
    void mountConnectionSettings(content,selected);
  }
  else if (selected === 'about') content.innerHTML = `<h1>About</h1><div class="settings-group about-product"><img class="app-mark" src="/brand/app-icon.png" alt="myfounderdock logo" width="44" height="44"><div><strong>myfounderdock</strong><p>Version 0.1.0</p></div></div><section><h2>keep any platform you want for your work within reach. all beautifully inside this native dock.</h2><p class="body-copy">your personal place for your development activity, website performance and product sales.</p><div class="settings-group"><div class="preference-row"><span>Built with</span><span class="technology-logos"><img src="/logos/tauri.png" alt="Tauri" title="Tauri" width="22" height="22"><img src="/logos/typescript.png" alt="TypeScript" title="TypeScript" width="22" height="22"></span></div><div class="preference-row"><span>Platform</span><span class="row-value">Windows</span></div></div></section>`;
  if(selected === 'general') {
    content.innerHTML += `<section class="platform-visibility"><h2>Show in dock</h2><div class="settings-group">${platforms.map(platform=>`<label class="preference-row"><span class="platform-setting-name"><img src="${platform.logo}" class="${platform.logoClass}" alt="">${platform.name}</span><input type="checkbox" role="switch" data-visible-platform="${platform.id}" aria-label="Show ${platform.name} in dock" ${preferences.hiddenPlatforms.includes(platform.id)?'':'checked'}></label>`).join('')}</div></section>`;
    content.querySelectorAll<HTMLInputElement>('[data-visible-platform]').forEach(input=>input.addEventListener('change',async()=>{
      const id=input.dataset.visiblePlatform!;
      const hidden=new Set(preferences.hiddenPlatforms);
      if(input.checked)hidden.delete(id);else hidden.add(id);
      preferences={...preferences,hiddenPlatforms:[...hidden]};
      try{await savePreferences(preferences);}catch(error){console.error('Could not save platform visibility',error);}
    }));
  }
  content.querySelectorAll<HTMLInputElement>('[name="dock-mode"]').forEach(input => input.addEventListener('change', async () => {
    if (!input.checked) return;
    preferences = { ...preferences, dockMode: input.value === 'edge' ? 'edge' : 'floating' };
    try { await savePreferences(preferences); } catch (error) { console.error('Could not save dock shape', error); }
  }));
  content.querySelectorAll<HTMLInputElement>('[data-preference]').forEach(input => input.addEventListener('change', async () => {
    preferences = { ...preferences, [input.dataset.preference!]: input.checked };
    try { await savePreferences(preferences); } catch (error) { console.error('Could not save preferences', error); }
  }));
  content.querySelector('#quit-dock')?.addEventListener('click', async () => { const { invoke } = await import('@tauri-apps/api/core'); await invoke('quit_dock'); });
}
function selectSection(section:string){
 if(section===selected)return;
 selected=section;render();content.scrollTop=0;
}
document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button=>button.addEventListener('click',()=>void selectSection(button.dataset.section!)));

document.querySelector('#close-settings')?.addEventListener('click', async () => {
  if (!native) { location.href = '/'; return; }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('hide_settings');
});
render();

if (native) void import('@tauri-apps/api/event').then(({ listen }) => listen<string>('settings-section', event => { if (['general', 'profile', 'about', ...settingsPlatforms.map(item => item.id)].includes(event.payload)) { void selectSection(event.payload); } }));

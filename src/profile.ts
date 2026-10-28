export interface PersonalProfile { name: string; note: string; photo: string }
const key = 'founder-dock-personal-profile';
export function readProfile(): PersonalProfile {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}');
    return {
      name: typeof value.name === 'string' ? value.name.slice(0, 40) : '',
      note: typeof value.note === 'string' ? value.note.slice(0, 280) : '',
      photo: typeof value.photo === 'string' && /^data:image\/(png|jpeg|webp|avif);base64,/.test(value.photo) ? value.photo : '',
    };
  } catch { return { name: '', note: '', photo: '' }; }
}
export async function saveProfile(value: PersonalProfile) {
  localStorage.setItem(key, JSON.stringify(value));
  if ('__TAURI_INTERNALS__' in window) {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('profile-changed', null);
  }
}

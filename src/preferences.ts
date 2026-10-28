export interface Preferences { glass: boolean; pinned: boolean; motion: boolean; dockMode: 'floating' | 'edge'; hiddenPlatforms: string[] }
const key = 'founder-dock-appearance';
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}');
    return { glass: value.glass !== false, pinned: value.pinned === true, motion: value.motion !== false, dockMode: value.dockMode === 'edge' ? 'edge' : 'floating', hiddenPlatforms: Array.isArray(value.hiddenPlatforms) ? value.hiddenPlatforms.filter((id: unknown): id is string => typeof id === 'string') : [] };
  } catch { return { glass: true, pinned: false, motion: true, dockMode: 'floating', hiddenPlatforms: [] }; }
}
export async function savePreferences(value: Preferences) {
  localStorage.setItem(key, JSON.stringify(value));
  if ('__TAURI_INTERNALS__' in window) {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('appearance-changed', value);
  }
}

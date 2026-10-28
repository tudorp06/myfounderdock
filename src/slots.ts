// LOGOS: put an image in public/logos, then set its URL here.
// Example: public/logos/claude.svg becomes logo: '/logos/claude.svg'.
// Leave logo null until you add the real asset; no initials or fake logos.
export const platforms = [
  { id: 'vercel', name: 'Vercel', logo: '/logos/vercel.png', logoClass: 'invert-logo', accent: '#e4e4e7' },
  { id: 'github', name: 'GitHub', logo: '/logos/github.png', logoClass: 'invert-logo', accent: '#a8c4b2' },
  { id: 'polar', name: 'Polar', logo: '/logos/polar.png', logoClass: '', accent: '#c2d4f3' },
  {id: 'stripe', name: 'Stripe', logo: '/logos/stripe.svg', logoClass: ''},
  { id: 'claude', name: 'Claude', logo: '/logos/claude_2150lbziwy.png', logoClass: '', accent: '#ee865c' },
  { id: 'codex', name: 'Codex', logo: '/logos/codex-logo.png', logoClass: '', accent: '#72d9b3' },
  { id: 'cursor', name: 'Cursor', logo: '/logos/cursor.svg', logoClass: '', accent: '#c7b4f3' },
  {id: 'trustmrr', name: 'TrustMRR', logo: '/logos/trustmrr.png', logoClass: '', accent:'#c7b4f3' },
] as const;
export const agents = platforms.filter(platform => ['claude', 'codex', 'cursor'].includes(platform.id));
export type PlatformId = typeof platforms[number]['id'];
export type Panel = PlatformId | 'profile';

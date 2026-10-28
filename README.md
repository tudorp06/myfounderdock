<p align="center">
  <img src="public/brand/app-icon.png" width="112" height="112" alt="myfounderdock app logo">
</p>
<h1 align="center">myfounderdock</h1>
<p align="center"><strong>The open-source dock for founder stats.</strong></p>

GitHub activity, AI usage, website analytics and product revenue in a compact desktop dock. Open a panel when you want a number, close it and get back to work. Built with Tauri, Rust and TypeScript; every user connects their own accounts.

## What you can keep in your dock

- **GitHub:** your contribution heatmap and three most recently pushed repositories, with links to open them.
- **AI usage:** Codex, Claude and Cursor quota windows and reset times from your installed account. Local CLI detection and explicit sign-in mean no executable path is required for standard installs. Availability depends on your account and provider.
- **Vercel:** choose a project and check its visitors and page views.
- **Polar:** recent paid orders across your products, with customer names, amounts and a product filter.
- **TrustMRR:** connect a startup by slug to see its logo, last 30 days of revenue, monthly recurring revenue and all-time revenue. Customer and subscription counts appear when the API supplies them.
- **Your space:** add your own photo, name and a short note.

Drag it anywhere, snap it to an edge, or make it horizontal. Choose a floating pill or an edge dock, switch between solid and glass panels, and hide the platforms you do not use. Only the selected panel opens, keeping the rest of your desktop clear.

## Your accounts, your setup

A fresh installation starts with a blank profile and disconnected providers. Add your GitHub username, provider tokens or local CLI sign-in through Settings. API tokens stay encrypted on your Windows account; credentials are never bundled with the source. No shared backend account is required.

Subscription dates are shown when a provider supplies them. Optional dates entered in Settings are labeled accordingly; usage panels do not display account emails. Stripe currently offers token configuration only, not statistics.

**Current platform: Windows.** macOS support and packaged releases are still being prepared. You can build and run the Windows source today.

## Run

`npm install`, then `npm run tauri dev` for the transparent desktop dock.
`npm run dev` serves the browser preview at http://127.0.0.1:1432; `/settings.html` previews settings.
`npm run tauri build -- --no-bundle` builds the Windows executable. The current source redesign is not yet a refreshed packaged release.

Hover or click a provider to open its panel. Close or Escape collapses it. Panels close after pointer leave unless kept open in settings; keyboard focus inside keeps them open. Tab to a provider and press Enter to open it. Drag the grip or empty rail gaps to move across displays. Drop near an edge to snap; top/bottom reflow horizontally, left/right vertically. Interior drops stay free-floating. Arrow keys on the grip move it (Shift moves farther). The rail grows or shrinks with visible providers and is 42px thick (46px in edge mode). Native bounds wrap only the rail and open panel; the bottom pill keeps clearance above the taskbar. Position persists separately for desktop and browser preview. Settings opens in a separate 760×540px window.

## Source map

| File | Purpose |
| --- | --- |
| `src/slots.ts` | Shared provider order, names, logo URLs and metadata |
| `src/dock-position.ts` | Pointer and keyboard movement, saved placement, orientation animation |
| `src-tauri/src/docking.rs` | Monitor work areas, atomic native bounds, snapping and geometry tests |
| `src/main.ts` | Rail and panel HTML, reserved profile slot, panel motion and settings launch |
| `src/github.ts` | Public profile, repository and contribution API requests |
| `src/github-panel.ts` | Live calendar, recent repository rendering and request caching |
| `src/style.css` | Dock typography, rail, glass details and motion |
| `src/settings.ts`, `src/settings.css` | Separate settings window, sidebar and preference rows |
| `src/preferences.ts` | Local preferences and cross-window updates |
| `src/profile.ts` | Local personal profile name, photo and note; cross-window synchronization |
| `src-tauri/src/main.rs` | Native window positioning, expansion, settings commands and URL opener |
| `DESIGN.md` | Current visual tokens and design rules |

## Add or change a logo

1. Put the authentic image in `public/logos/`.
2. Edit its provider entry in `src/slots.ts`: `public/logos/claude.svg` becomes `logo: '/logos/claude.svg'`.
3. Keep `logoClass: ''` normally. The existing GitHub asset uses `invert-logo` for the dark background; use that only when the actual asset needs inversion.
4. Check both the dock and settings sidebar. Both `main.ts` and `settings.ts` render the shared mapping.

| Provider ID | Current logo URL |
| --- | --- |
| `vercel` | `/logos/vercel.png` |
| `github` | `/logos/github.png` |
| `claude` | `/logos/claude_2150lbziwy.png` |
| `codex` | `/logos/codex-logo.png` |
| `polar` | `/logos/polar.png` |
| `cursor` | `/logos/cursor.svg` |
| `stripe` | `/logos/stripe.png` |
| `trustmrr` | `/logos/trustmrr.png` |

Learning recipe: change one logo URL in `slots.ts`, reload both surfaces and trace how each file's `platforms.map(...)` turns that metadata into an image. The URL starts at `public/`, not `src/`. The original supplied v0 PNG is retained separately; it is not Vercel branding. `image.png` is a Kitbar reference screenshot, not a provider logo.

## Connect your own accounts

Fresh installations start disconnected. Open Settings and choose a provider:

- **GitHub:** enter a public username. The panel shows its public contribution calendar and three most recently pushed repositories.
- **Vercel:** save an access token, set an optional Team ID, and choose a project. Web Analytics must be enabled for the project.
- **Polar:** save an organization token with permission to read orders. Purchases appear newest first and can be filtered by product.
- **TrustMRR:** save an API key and a startup slug. Choose dollars or cents to match the amounts returned by your API/dashboard.
- **Codex / Claude / Cursor:** choose Sign in with the provider to use its locally detected CLI and official browser sign-in. Detect CLI checks again after installation. Existing sign-ins can be connected without signing in again; executable/profile folder overrides are optional under Advanced. Cursor supports editor or Agent accounts. Subscription access depends on the selected account's plan.
- **Stripe:** token configuration is available; Stripe statistics are not yet implemented.

Use Test connection to verify access. Disconnect removes this app's connection and saved API token; it does not sign out the provider's CLI/editor. General → Show in dock controls visibility independently of connection settings.

Account configuration is stored under `%APPDATA%/myfounderdock/connections.json`. API tokens are encrypted using Windows DPAPI for the current Windows user. The frontend receives token-presence metadata, never saved token contents. Tokens are not stored in localStorage or included in distributable assets. The `.env` examples and standalone TypeScript test scripts are for development exercises, not end-user account setup.

Codex reads plan, quota windows and available token totals through the installed Codex app-server protocol. Claude and Cursor read the selected local sign-in through their native usage services; these endpoints can change. Percentages and reset dates are rendered only when returned. A billing-cycle boundary is not presented as a confirmed payment or renewal. Subscription rows remain visible when a provider does not return billing dates. Users may optionally set subscription start, last payment, and next billing dates in the provider Settings; those values are labeled as coming from Settings. Next billing includes a countdown. Usage panels do not display account emails.

GitHub's calendar uses the third-party `github-contributions-api.jogruber.de` service; repositories come from `api.github.com`. Public results are cached. Provider usage is cached briefly to limit repeated requests.

Your personal photo, display name and note remain separate from provider accounts. Edit them in Settings → Your profile. They are saved locally under `founder-dock-personal-profile` and synchronized between app windows.

### Connection implementation

| File | Purpose |
| --- | --- |
| `src/connections.ts` | Per-provider configuration forms, testing and disconnect controls |
| `src-tauri/src/connections.rs` | Configuration validation and Windows-encrypted token storage |
| `src-tauri/src/agent_usage.rs` | CLI detection, explicit login and normalized AI usage data |
| `src/agent-panel.ts` | Usage bars, reported billing fields and account settings entry point |
| `src/trustmrr-panel.ts` | Revenue rendering for the configured startup |

## Design and runtime

The approved Kitbar-inspired direction uses a black rail in two persisted shapes: Floating pill (default, 42px wide, 12px edge clearance, 23px corners) or Edge dock (46px wide, 23px left corners). Both keep fixed 27px provider circles, local Mona Sans, 12px detail corners and short CSS/Web Animations transitions. See `DESIGN.md` for the durable design system. General settings include the Dock shape radio choice and control glass panels, motion and keeping panels open; system reduced motion is always respected.

Tauri uses Windows WebView2. The app remains visible in the taskbar so it can be recovered or closed. Tray, autostart and global shortcuts are not implemented.

Cursor cube source: https://cursor.com/brand (official brand archive, CUBE_2D_DARK.svg).

## License

Project source is licensed under the [MIT License](LICENSE). Third-party assets retain their respective licenses and trademark rights.

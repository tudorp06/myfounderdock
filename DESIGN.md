---
name: myfounderdock
description: A quiet right-edge companion for a founder's platforms.
colors:
  rail: "#030303"
  detail: "rgba(6,7,9,.95)"
  detail-solid: "#060709"
  text: "#f2f2f3"
  muted: "#a5a6ae"
  line: "#ffffff12"
  ring: "#6e7076"
  ring-active: "#e0e2e6"
  settings-background: "#1d1e20"
  settings-sidebar: "#242527"
  settings-group: "#28292c"
  settings-text: "#eeeef1"
  settings-muted: "#aaabb2"
  settings-line: "#ffffff0e"
  settings-blue: "#2877e8"
typography:
  title:
    fontFamily: "Dock Sans, Segoe UI Variable, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 620
    letterSpacing: "-.2px"
  body:
    fontFamily: "Dock Sans, Segoe UI Variable, Segoe UI, sans-serif"
    fontSize: "10px"
  label:
    fontFamily: "Dock Sans, Segoe UI Variable, Segoe UI, sans-serif"
    fontSize: "9px"
  settings-title:
    fontFamily: "Dock Sans, Segoe UI Variable, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 580
    letterSpacing: "-.3px"
  settings-body:
    fontFamily: "Dock Sans, Segoe UI Variable, Segoe UI, sans-serif"
    fontSize: "11px"
rounded:
  detail: "12px"
  rail-floating: "23px"
  rail-edge: "23px 0 0 23px"
  group: "8px"
  control: "5px"
  circle: "50%"
spacing:
  detail-padding: "14px"
  rail-gap: "5px"
  settings-content: "23px 26px"
  group-inline: "12px"
components:
  rail-floating:
    backgroundColor: "{colors.rail}"
    rounded: "{rounded.rail-floating}"
    width: "42px"
    height: "370px"
    padding: "12px 0"
  rail-edge:
    backgroundColor: "{colors.rail}"
    rounded: "{rounded.rail-edge}"
    width: "46px"
    height: "370px"
    padding: "12px 0"
  provider-circle:
    rounded: "{rounded.circle}"
    size: "27px"
  detail:
    backgroundColor: "{colors.detail}"
    textColor: "{colors.text}"
    rounded: "{rounded.detail}"
    width: "336px"
    padding: "{spacing.detail-padding}"
  settings-group:
    backgroundColor: "{colors.settings-group}"
    rounded: "{rounded.group}"
    padding: "0 12px"
  settings-nav-active:
    backgroundColor: "{colors.settings-blue}"
    textColor: "#fff"
    rounded: "{rounded.control}"
    padding: "8px 9px"
  quiet-button:
    backgroundColor: "#37393d"
    textColor: "#e0e1e5"
    rounded: "{rounded.control}"
    padding: "7px 10px"
---

# Design System: myfounderdock

## Overview

**Creative North Star: "The glanceable right-edge companion"**

A black, compact desktop utility with Kitbar-inspired density, small crisp type and restrained glass detail surfaces. The rail stays quiet until a provider opens a concise panel to its left. Settings belongs in a separate sidebar window.

**Key Characteristics:**

- Slim black rail and muted silver provider rings.
- Authentic provider assets, with empty circles where no logo is supplied.
- Small local Mona Sans type and short, responsive motion.
- Honest connection states and live GitHub content.

## Colors

The rail and detail panel use near-black neutrals, with silver text and rings. Settings adds a blue selected navigation row and enabled switches. Green contribution cells encode real GitHub activity; they are data colors, not a general brand accent.

**The Honest State Rule.** Use connection labels and real data to communicate status. Do not decorate unconnected providers with invented activity.

## Typography

Dock Sans is the CSS alias for the bundled Mona Sans variable font in `public/fonts/mona-sans.woff2`. The frontmatter defines the shared family and principal roles. Dock headings remain compact; supporting data labels range from 7–10px. Settings has its own larger title and 11px row text. Numeric metrics use tabular figures.

## Layout

The vertically centered rail is 350px tall. Floating mode is the default: a 42px rail with an 8px right margin. Edge mode uses a 46px rail flush to the right edge. A personal profile button and six provider buttons have 27px circles within 36×35px targets. A single 336px detail panel sits 62px from the right edge in floating mode or 58px in edge mode, leaving a 12px gap beside the rail. Detail content scrolls within the viewport.

Native window bounds differ from visible rail bounds: collapsed 58×380px in floating mode or 46×380px in edge mode, expanded 410×600px, constrained to available screen space. Settings opens independently at 760×540px, with a 38px title bar and 176px sidebar. Below 640px, the sidebar becomes 144px and content padding tightens. Provider circles stay fixed at 27px in both modes, independent of native window height.

## Elevation & Depth

Glass detail panels use a 22px backdrop blur, 110% saturation and one soft shadow. Turning off glass selects the solid detail surface. Settings uses tonal layering and fine dividers rather than floating cards. Exact shadows and motion live in the sidecar.

## Shapes

Circular provider rings anchor the rail. Detail corners use the restrained 12px language; settings groups use 8px corners and navigation uses 5px corners. Floating mode uses a complete capsule with 23px corners. Edge mode uses 23px left corners and square right corners. Neither mode uses flared pseudo-elements.

## Components

- **Provider buttons:** real logo images centered inside silver rings; missing logos remain empty. Hover brightens the ring and scales it slightly; the open provider has a lighter ring. Keyboard focus has an explicit outline and provider tooltip.
- **Detail panel:** one provider at a time, concise header, dismiss button and compact content. Hover or click opens; Escape restores focus to the provider. Pointer leave closes after a short delay unless pinned or keyboard focus is inside.
- **GitHub activity:** centered logo-only header with a screen-reader heading, no subtitle and no trailing repository arrows. Preserve the existing 20-week calendar, three recent repository links and source attribution.
- **Personal profile:** a separate rail circle opens a centered card with a circular photo, display name, multiline note and Edit profile action. Settings provides a photo picker and compact outlined name/note fields. This local personalization is separate from GitHub profile API wiring.
- **Settings navigation:** labeled icons, blue active row and connection indicators. General, profile personalization, six platforms and About share the same sidebar.
- **Preference groups:** compact divided rows with descriptive labels and switch controls. General includes a radio choice between Floating pill and Edge dock. The dockMode preference (floating by default), glass, panel animation and keep-open preferences save automatically.
- **Unavailable data:** explicit unconnected copy, em dashes and disabled project selection. Vercel, Polar and agent connections are not implemented.

**The Quiet Motion Rule.** Use the existing short CSS and Web Animations transitions. Honor both the app motion setting and system reduced motion.

## Do's and Don'ts

### Do:

- **Do** preserve the slim rail, compact provider circles and concise left-opening panels.
- **Do** edit shared provider logos in `src/slots.ts` so dock and settings stay consistent.
- **Do** preserve live GitHub activity, repository links and source attribution.
- **Do** keep settings in its separate sidebar window.

### Don't:

- **Don't** add letter placeholders or fabricated provider logos.
- **Don't** return to bulky rails, oversized rings or excessive rounding.
- **Don't** invent metrics, accounts or connected integrations.

## Movable rail

Drag the grip or gaps; snap to any display edge or leave it floating. Top/bottom use a horizontal rail, left/right vertical. Keep logos upright. Native bounds update atomically; the 240ms axis-change reveal stays inside the final rail, with no temporary oversized canvas or delayed second resize. Bottom placement stays above the taskbar, including edge mode. Preserve reduced-motion support and saved desktop/preview placement independently.

## Provider detail identities

Agent sheets use a logo/name header, grouped usage rows and subscription date rows. Codex uses blue progress, Claude orange; unknown usage is an unfilled tinted track with an em dash, never a fabricated percentage. Subscription fields stay unavailable until a trustworthy source is connected; do not infer charges or renewal dates from sign-in dates. GitHub uses a contained dark activity widget, rounded green cells and actual today/Monday-week/current-streak summaries, while retaining its 20-week range and repository links.

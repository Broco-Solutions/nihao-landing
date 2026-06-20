---
name: nihao-design
description: Use when editing the Nihao Negocios Next.js site to enforce premium design, brand voice, page architecture, and mobile-first QA. Triggered by files in app/, components/, lib/content.ts, or any visual/copy change.
---

# Nihao Negocios — Design & Development Rules

## Brand & Aesthetic

- Premium, clean, modern, international feel.
- Avoid "touristy" or cliché Chinese imagery (dragons, lanterns, red gradients, generic Asian icons).
- The red/burgundy is a refined brand accent, not a decorative theme.
- Keep the site short and focused: this is not an infinite-scrolling landing page.

## Color Palette

| Role | Token |
| --- | --- |
| Brand accent | `text-nihao`, `bg-nihao`, `border-nihao` |
| Soft brand fill | `bg-nihao-soft`, `bg-nihao/5`, `bg-nihao/10` |
| Background | `bg-paper` (warm off-white) |
| Primary text | `text-ink` (near-black) |
| Secondary text | `text-ink-soft`, `text-nihao-ink` |
| Muted lines/borders | `border-nihao/30`, gradients with low opacity |

- Do not introduce new colors outside this palette without asking.

## Site Architecture

Use page-based routing. The main pages are:

- `/` — Home
- `/sobre-nihao` — About
- `/servicios` — Services
- `/nihao-academy` — Academy
- `/contacto` — Contact

The navbar must link to: **Inicio**, **Sobre Nihao**, **Servicios**, **Nihao Academy**, **Contacto**.

Do **not** create standalone top-level sections or pages for:

- Método
- Sourcing
- Feria de Cantón

These topics may live inside `/servicios` cards or modals/drawers if needed.

The Home page must stay short and commercial. Detailed explanations belong in internal pages, service drawers, or modals, not in the home.

## Services Pattern

- Services are presented as cards or square tiles.
- Clicking a card opens a modal or drawer with details.
- Keep card titles short and aligned with approved copy.

## Calls to Action

- The primary CTA must lead to WhatsApp.
- Use a consistent, prominent button style.
- Do not dilute the CTA with multiple competing actions in the same viewport.

## Mobile-First QA

Before considering any visual task done, verify at least these widths:

- 375px
- 390px
- 430px

Rules:

- No horizontal scroll.
- Touch targets ≥ 44×44px.
- Text never overlaps graphics.
- Modals/drawers must fit small screens.

## Header / Logo

- Keep the header minimal and fixed or sticky only when needed.
- The logo must be visible, centered, proportional, and never overflow the header. Do not add an unnecessary external white ring around the logo; the actual Nihao mark is the red circle with the Chinese symbol, and that symbol must remain legible.
- Avoid decorative gradients or animation on the logo.
- Nav links must match the approved page list above.

## Hero

- One strong headline, one short supporting line, one CTA.
- Do not stack multiple sections inside the hero.
- Background must feel premium: subtle, not noisy.
- Keep vertical padding balanced; do not inflate the hero height.

## Bridge Section (Latinoamérica / Europa → Nihao → China)

- Use the existing `BridgeSection` component as the source of truth.
- Keep the title, labels, central circle, and overall composition unchanged.
- Curved bridge lines must render **behind** the central Nihao circle.
- Labels (`Latinoamérica`, `Europa`, `China`) must never be crossed by lines:
  - Give them a subtle `bg-paper` background on desktop.
  - Keep them above the SVG layer (`z-10`).
- Do not enlarge, redesign, or replace the bridge graphic.
- Mobile version (`md:hidden` / `hidden md:block`) should be left untouched unless the same issue exists there.

## Copy Rules

- Use the approved texts from the project PDF/content source.
- Reduce visible text: prefer concise lines over paragraphs.
- Do **not** invent testimonials, statistics, or credentials.
- Do **not** invent new service names or claims.

## Change Philosophy

- Do not redesign from scratch if something already works.
- Before modifying a section, audit what already matches the rules above.
- Apply only the minimal changes needed to fix the issue or fulfill the request.
- Preserve existing animations, motion, and transitions unless they break the rules.
- Before any significant change, run or inspect `git status` and avoid touching unrelated files.

## Files to Check

When a visual or copy change is requested, review first:

- `app/page.tsx`
- `app/layout.tsx`
- `components/sections/`
- `components/ui/`
- `lib/content.ts`
- `app/globals.css`
- Theme / Tailwind config files

## Final Validation

Before marking a task as complete:

* Run `npm run build`.
* Run `npm run lint` if the script exists.
* Check `git status --short`.
* Report changed files.
* Report what was changed and what was intentionally left untouched.
* For visual changes, remind the user to verify desktop and mobile manually in `localhost:3000`.

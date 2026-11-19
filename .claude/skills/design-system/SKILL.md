---
name: design-system
description: The colours, the type scale, the shapes, the motion values, the brand marks and the ASCII art rules of the Research Marshal web UI, with the rule that decides when to use each. Use it before any change to a colour, a font size, a component style, the icon, the wordmark or the ASCII art, and whenever a task says "design system", "colours", "typography" or "brand".
---

# Research Marshal design system

Every value is a token in `app/globals.css`, written once for `:root` (light) and once for `.dark`. `lib/ui/design-system.ts` gives each token its role, its usage rule and the surfaces it must stay readable on. That model has two readers: the page `/designsystem` for people, and `references/tokens.md` for you.

Read `references/tokens.md` before you pick a colour, a size, a radius, a shadow or a duration. It lists every token of both themes with its value, its hex and its measured contrast, and the type scale by job.

## Colour

- Use a token through its Tailwind utility: `--primary-ink` is `text-primary-ink`, `bg-primary-ink`, `border-primary-ink`. Never write a colour value or a Tailwind palette colour such as `text-red-500` in a component.
- Keep orange rare. `bg-primary` fills the one main action of a screen. If a screen has two filled orange controls, change one.
- Write orange text with `text-primary-ink`, not `text-primary`.
- Put `text-primary-foreground` on anything filled with `bg-primary`. It is near-black in the dark theme, because white on that orange is 3.1:1.
- Use `text-link` for every link and every citation, and `bg-link-soft` for a citation chip. Never use blue for a status or a button.
- `--secondary` is the neutral fill of the secondary button. The secondary colour of the palette is `--link`.
- Give every status a word and an icon. Green is `text-success`, red is `text-destructive`.
- For a warning, use `bg-warning-soft` with `text-warning-soft-foreground` in a pill, `bg-warning-fill` for a dot, and `text-warning` only for a bare word. Never put `text-warning-fill` on a light surface.
- Use `text-highlight` only for a small detail such as a quote mark or one icon. Never for text.
- Put a colour only on a surface that `references/tokens.md` lists for it under Contrast. For a new pair, add the surface to the role first.
- Write every colour out in both blocks. Do not alias one token to another with `var()`: the alias keeps its light value inside a nested `.dark` panel.
- The start screen is a `.dark` panel in both themes. A menu that opens from it leaves the panel, so give its popup `className="dark"`.

## Typography

- Use Geist (`font-sans`, the default) for everything a person reads.
- Use Geist Mono (`font-mono`) only for machine facts: a query, a URL, a domain, a duration, a count, the name of a step. Add `tabular-nums` to a number that changes.
- Pick a step of the type scale by its job, and write its classes as `references/tokens.md` gives them. Do not add a font size.
- Use weight 400 for running text, `font-medium` for a control or a label, `font-semibold` for a heading. No other weight.
- Add `tracking-tight` to a heading from 18px up, `text-balance` to a heading, `text-pretty` to a paragraph.

## Shape, depth and motion

- Pick the radius by the size of the element: `rounded-md` for a chip in a line, `rounded-lg` for a control, `rounded-xl` for a card, `rounded-2xl` for a panel, `rounded-full` for a pill. Do not use `rounded-3xl` or `rounded-4xl`.
- Separate surfaces with a 1px `border`, not a shadow. A shadow is for something that floats: `shadow-md` for a popover, `shadow-lg` for a sheet.
- Use `duration-150` for a change under the pointer and `duration-200` for something that moves or arrives, both with `ease-out`.
- Add `motion-reduce:animate-none` or `motion-reduce:transition-none` to everything that moves.
- Give every control a focus ring with `focus-visible:outline-2 focus-visible:outline-ring`, or `outline-sidebar-ring` in the sidebar.

## Brand

- The app icon is `assets/brand/icon-1024.png`. `app/icon.png` and `app/apple-icon.png` are the sizes a browser asks for. Change all three together, and never recolour the icon.
- Render the lockup with `BrandMark` and `Wordmark` from `components/app/brand-mark.tsx`. Only "Marshal" takes the primary ink.
- Keep the gap between the icon and the name (10px at 28px) free on every side of the lockup.
- Render Decodo with `DecodoMark` from `components/run/decodo-mark.tsx`. Never change its paths. Set its colour through the text colour of its parent, and say "Decodo" in text next to it.

## ASCII art

- Use ASCII art as a signature: the scene on the start screen, the glyph spinner for what runs, a dithered glyph for a run without a report. Do not put a scene behind text that a person reads.
- Draw with the engine in `lib/ascii`. Never use a bitmap in place of glyphs.
- Keep every canvas `aria-hidden`, without pointer events, paused off screen, and still under reduced motion. `AsciiShader` does this. Do not switch it off.
- Never import `lib/ascii/shader` or a scene of `components/asciicn` into a run page. Load a scene with `next/dynamic` and `ssr: false`, as `components/asciicn/start-background.tsx` does.
- Use `GlyphSpinner` for every spinner. Do not add another one.

## Change or add a token

1. Edit the value in `app/globals.css`, in `:root` and in `.dark`. For a new colour, also add `--color-<name>: var(--<name>);` to the `@theme inline` block.
2. For a new token, add its role to `COLOR_ROLES` in `lib/ui/design-system.ts`: the group, a name, the usage rule, and under `text` or `nonText` every surface it sits on.
3. Run `pnpm design:tokens`. It rewrites `references/tokens.md`.
4. Run `pnpm test lib/ui/contrast.test.ts lib/ui/design-system.test.ts`. A pair under its floor, a token without a role, or a font size, radius, shadow or duration that the scale does not name fails here.
5. Look at `/designsystem` in both themes.

A new font size, radius, shadow or duration in a component fails the same test until `TYPE_ROLES`, `RADIUS_ROLES`, `SHADOW_ROLES` or `DURATION_ROLES` names it. Prefer a step that exists.

## Check a change in the browser

Follow the `verify` skill (`.claude/skills/verify/SKILL.md`). Serve the app and run the flow of the page:

```sh
.claude/skills/verify/scripts/ui.sh design-system --port 3311 --prod
node .claude/skills/verify/scripts/browser.mjs --base http://127.0.0.1:3311 \
  --out <evidence folder> .claude/skills/verify/scripts/steps/design-system.json
```

The flow compares every contrast ratio on the page with the two colours as the browser paints them. Then read the screenshots. Restart `next dev` after an edit of `app/globals.css`: it can keep serving the old stylesheet.

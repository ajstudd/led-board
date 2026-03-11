I have viewsonic viewboard in office, it is a touchscreen tv like device.
Serial number X17222513005, Model Number IFP7532-2, Android version 9, Kernel version 4.19.113.
It has a firefox browser named firefox daylight, build number or version 95.2.0. 
Last updated on 2021-12-16 
AC: 95.0.14
GV: 95.0.1-20211215221728

---


Let me investigate your project's CSS setup and components to identify compatibility issues with Firefox 95.    

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/package.json)

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/app/globals.css)

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/postcss.config.mjs)

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/next.config.ts)

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/app/page.tsx)

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/app/layout.tsx)

Now let me look at the main components to understand the Tailwind classes being used:  

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/app/components/LEDBoard.tsx#1-1), lines 1 to 100

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/app/components/ControlPanel.tsx#1-1), lines 1 to 100

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/app/components/ControlPanel.tsx#100-100), lines 100 to 250

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/tsconfig.json#1-1), lines 1 to 30

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/app/components/ControlPanel.tsx#250-250), lines 250 to 400

Searched for regex `oklch|oklab|color-mix|@layer|@container|:has\(|:is\(|backdrop-filter|backdrop-blur|dvh|svh|lvh` (`**/*.{css,tsx,ts}`), 6 results

Now let me check what CSS features Tailwind v4 generates:  

Searched for regex `@property|color-mix|oklch|oklab|@layer|light-dark` (`**/*.css`), no results

Searched for regex `structuredClone|replaceAll|Array\.at\(|Object\.hasOwn|\.at\(` (`**/*.{ts,tsx}`), no results

Searched for regex `structuredClone|replaceAll|\.at\(|Object\.hasOwn|globalThis|queueMicrotask|AbortSignal\.timeout` (`**/*.{ts,tsx}`), 5 results

Searched for regex `optional chaining|\?\.|Promise\.allSettled|\?\?=` (`**/*.{ts,tsx}`), 20 results

Read [](file:///c%3A/Users/j7654/WorkStation/led-board/eslint.config.mjs)

Here's the root cause and how to fix it.

## Root Cause: Tailwind CSS v4 is incompatible with Firefox 95

Your project uses **Tailwind CSS v4** (`@tailwindcss/postcss` v4) which generates CSS using modern features that Firefox 95 (Dec 2021) does **not** support:

| CSS Feature | Required by Tailwind v4 | Firefox Support |
|---|---|---|
| `@layer` (cascade layers) | All utility ordering | Firefox 97+ |
| `oklch()` colors | All color utilities | Firefox 113+ |
| `color-mix()` | Opacity modifiers like `bg-black/80` | Firefox 113+ |
| `@property` | Custom property types/init values | Firefox 128+ |

**What happens on your ViewBoard:** Firefox 95 encounters `@layer { ... }` blocks and treats them as unknown at-rules, **silently discarding all the CSS rules inside**. This is why:
1. The panel renders (JS/React works fine)
2. It's completely unstyled (all CSS is inside `@layer` blocks → discarded)
3. It disappears (the collapse/animation JS logic kicks in on an unstyled panel)

## Fix: Add `postcss-lightningcss` to transpile CSS for older browsers

Add a PostCSS step **after** Tailwind that downlevels the modern CSS to Firefox 95-compatible output. This changes zero component code — only the PostCSS pipeline.

### 1. Install the plugin

```bash
npm install -D postcss-lightningcss browserslist
```

### 2. Update postcss.config.mjs

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-lightningcss": {
      browsers: ">= 0.5%, Firefox >= 95",
      lightningcssOptions: {
        drafts: {
          customMedia: true,
        },
      },
    },
  },
};

export default config;
```

This runs Lightning CSS **after** Tailwind generates the CSS, and it will:

- **Unwrap `@layer`** → flattens cascade layers into plain CSS (preserving order)
- **Convert `oklch()` → `rgb()`** → compatible color values
- **Compute `color-mix()`** → static fallback values
- **Remove/downlevel `@property`** → inline fallback values

### 3. Fix the non-standard `overflow-y: overlay` in globals.css

On globals.css, `overflow-y: overlay` is a Chrome-only non-standard value. Firefox (any version) ignores it. Change it to:

```css
.thin-scrollbar {
  overflow-y: auto;
}
```

### 4. (Optional) Add browserslist to package.json

This helps other tools in the pipeline (SWC/Next.js JS compilation) also target Firefox 95:

```json
"browserslist": [
  ">= 0.5%",
  "Firefox >= 95",
  "not dead"
]
```

## Why this won't break your existing setup

- **No component changes** — all Tailwind classes stay the same
- **PostCSS plugin ordering** — `postcss-lightningcss` runs *after* `@tailwindcss/postcss`, so it only transforms the final CSS output
- **Modern browsers unaffected** — the transpiled CSS produces identical visual results; it just uses `rgb()` instead of `oklch()` and flat rules instead of `@layer`
- **Build-time only** — no runtime overhead

## Additional note

Firefox 95 on Android 9 (your ViewBoard's kernel 4.19) hasn't been updated since 2021. If you encounter **JavaScript** issues beyond CSS (unlikely since ES2017 target in tsconfig.json is well-supported), the browserslist addition in step 4 will also instruct Next.js/SWC to transpile JS appropriately.
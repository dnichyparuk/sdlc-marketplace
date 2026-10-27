---
applyTo: "site/src/**/*.astro,site/src/styles/**/*.css"
---
# ui-review — Review Instructions

Reviews Astro components and pages for semantic HTML, Tailwind CSS usage, responsive design, and component composition patterns

Default severity: medium

## Checklist

- Astro components use semantic HTML elements (`<nav>`, `<main>`, `<article>`, `<section>`) over generic `<div>` wrappers
- Interactive elements have accessible names (text content, `aria-label`, or `aria-labelledby`)
- Images include meaningful `alt` attributes; decorative images use `alt=""`
- Tailwind CSS classes follow project conventions — no conflicting or redundant utility classes
- Responsive design: layouts adapt to mobile/tablet/desktop (check `sm:`, `md:`, `lg:` breakpoints)
- Component props are typed and documented via Astro `Props` interface
- No inline styles when a Tailwind utility or CSS class exists for the same purpose
- Links use descriptive text (avoid "click here" or bare URLs as link text)
- Color contrast is sufficient — avoid light-on-light or dark-on-dark text patterns
- Component composition is appropriate — shared elements (Nav, Footer, SEOHead) are reused, not duplicated
- Astro `client:*` directives are used only when client-side interactivity is actually needed
- Page metadata (`<title>`, `<meta description>`) is present via SEOHead component

## Severity Guide

| Finding | Severity |
|---------|----------|
| Missing accessible name on interactive element | high |
| Broken layout on mobile (missing responsive classes) | high |
| Duplicated component logic that should be shared | medium |
| Inline styles replacing available Tailwind utilities | medium |
| Missing `alt` on informative image | medium |
| Unnecessary `client:load` on static content | medium |
| Redundant Tailwind classes | low |
| Missing page metadata | low |

## Note

In Claude Code reviews, files matching these patterns are excluded: **/node_modules/**, site/dist/**, site/.astro/**.
Copilot path-specific instructions do not support exclusion patterns — use judgment when findings apply to these files.

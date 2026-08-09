# Prototype provenance

`index.html` is a standalone implementation of the hi-fi design imported from Claude Design.

- **Design project:** "Wireframe starting point"
  (`537c73fb-894a-476f-9c60-3d0bce96c2dc`)
- **Source file:** `Auburn Course Feedback - HiFi.dc.html`
- **Imported via:** the `claude_design` MCP (`DesignSync`), 2026-08-09

## What was translated

The source `.dc.html` is a Claude Design component: an `<x-dc>` template with
`{{ }}` bindings, `<sc-if>` / `<sc-for>` control flow, and `style-hover` inline
hover styles, driven by a `DCLogic` subclass and the proprietary `support.js`
runtime (which itself needs `window.React` / `window.ReactDOM`).

`index.html` reproduces the same visuals and behavior with **no runtime
dependency** — inline styles became CSS classes (with real `:hover` rules), and
the `DCLogic` state machine became a small vanilla-JS module. Behavior kept 1:1:

- Views: landing / list / course / add (routed by `data-active`)
- Theme: light / dark / system, persisted to `localStorage` (`pc-theme-mode`),
  `system` follows `prefers-color-scheme`
- Course tabs: Overview / Reviews
- Review helpful up/down voting (toggle, from `baseReviews`)
- Filters panel toggle, sign-in / user toggle, add-review scale pills

The theme design tokens (the `[data-theme]` CSS custom properties) are copied
verbatim from the source so colors match exactly.

The canonical design remains the Claude Design project above; re-import from
there rather than treating this file as the design source of truth.

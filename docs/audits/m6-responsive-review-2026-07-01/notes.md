# M6 Responsive Review

Date: 2026-07-01
Scope: In-app browser using the M6 fixture graph.

## Viewports Checked

1. Desktop-ish: `1030x698`
   - Health: no horizontal overflow in body, shell, right pane, code panel, or Inspector.
   - Evidence: `01-desktop-1030x698.png`.

2. Tablet: `820x720`
   - Before fix: source code had horizontal overflow in the lower code pane.
   - After fix: source code wraps in the constrained layout; no body, shell, right-pane, code, or Inspector horizontal overflow.
   - Evidence: `02-tablet-820x720.png`, `04-tablet-820x720-after.png`.

3. Mobile-like: `430x760`
   - Before fix: source code had horizontal overflow and the AI button row made `Check AI` too narrow.
   - After fix: AI buttons stack, code wraps, the lower code/Inspector region has more room, and the graph toolbar button stays inside the graph pane.
   - Evidence: `03-mobile-430x760.png`, `05-mobile-430x760-after.png`, `06-mobile-430x760-final.png`.

## Remaining Notes

- Narrow mobile is usable for inspection, but Cobolens is still primarily a desktop workspace. The mobile layout is a resilience path rather than the main product target.
- The left navigator necessarily scrolls at tablet and mobile widths because it contains ingest, filters, inventory, AI settings, and export controls.

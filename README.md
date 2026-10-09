# Gangnam Station · Spatial Lab

A static, vanilla JavaScript / three.js visualization of a schematic 100m-radius neighborhood around Gangnam Station. Geometry is illustrative, not surveyed map data.

## Run locally

From the repository root, run `python3 -m http.server 8000`, then open the server in a WebGL-capable browser. No build, API key, external CDN, or dependency installation is required. three.js 0.180.0 and its MIT license are included in `vendor/`.

## Interaction

- Select A–C (office workers in suits) or D–F (tourists in Hawaiian shirts and backpacks) with a button, person, or label.
- Click the ground to move the selected person. Invalid destinations preserve the previous route.
- Routes avoid buildings, benches, trees, and the circular boundary, including body clearance.
- Drag to rotate the view, scroll to zoom. Camera dragging does not assign a destination.
- Stop affects the selected person. Reset returns all six people to their starting positions.

## GitHub Pages

All asset paths are relative, so the app supports a project URL such as `/Spatial-Ai/`. Set Pages to **Deploy from a branch**, branch **main**, folder **/(root)**. A push to that branch triggers the Pages deployment. An empty `.nojekyll` file disables Jekyll processing.

## Validation

`node --test tests/model.test.mjs` exercises the boundary, obstacles, identity data, and pathfinding. Serve the site locally and run `python3 tests/browser_smoke.py` with Playwright and Chromium installed to test real selection, click-to-move, destination rejection, camera dragging, STOP, reset, console errors, and mobile layout.

## Dependencies

- three.js 0.180.0 (MIT), vendored from the npm package with package integrity verification.
- Browser tests require Playwright; runtime does not.

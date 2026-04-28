# SCALEZ Vision Engine

Desktop workspace scaffolded for Electron + React + Vite (JavaScript) with a split architecture:

- Electron process code in src/main
- React renderer code in src/renderer

## Scripts

- npm run dev: starts Vite and Electron together
- npm run build: builds the renderer into dist
- npm run preview: previews the renderer build
- npm run electron: launches Electron directly

## Structure

src/
- main/
	- main.cjs
	- preload.cjs
- renderer/
	- main.jsx
	- App.jsx
	- styles.css

## Notes for Windows

- The dev server is pinned to 127.0.0.1:5173 in Vite config for predictable Electron startup.
- Electron loads query-based window modes to support separate control and output window surfaces.

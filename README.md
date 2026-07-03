# Prompt Forge

Prompt Forge is a browser-only React app that turns rough requirements, code notes, and selected project files into structured prompts for AI coding assistants.

## Features

- Generates Japanese or English prompts locally in the browser
- Reads selected project files without sending them to an external API
- Detects common tech stacks from project manifests
- Supports task-specific output formats and constraints
- Includes a Claude Code copy mode with a prompt-optimizer instruction

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The app is configured for GitHub Pages. During GitHub Actions builds, Vite automatically uses the repository name as the base path, so the same project can be published as `https://OWNER.github.io/REPOSITORY/`.

## Deployment

Push to `main` and enable GitHub Pages with **GitHub Actions** as the source.

# React + Vite

Full-stack storefront: React (Vite) frontend + Cloudflare Pages Functions + D1.

## Run the full stack locally

The API endpoints (`/api/*`) and the D1 database are only available through
Wrangler, not the plain Vite dev server. Use:

```bash
npm run dev:full
```

This builds the frontend and serves the app + functions + local D1 on
`http://localhost:8788` — so the WhatsApp checkout both saves the order to the
local database and opens WhatsApp.

> First run: if your local D1 is missing tables or products, rebuild it with
> `npx wrangler d1 execute mambo-beard-db --local --file functions/schema.sql`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

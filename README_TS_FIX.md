# TypeScript build fix for Vercel

This update adds the required devDependencies for a TypeScript Next.js project:

- typescript
- @types/react
- @types/node

## Deploy on Vercel

1. Push these files to your repo (including `package.json`).
2. Vercel will run `npm install` and then `npm run build`.

If you still need to bypass type errors temporarily, uncomment in `next.config.mjs`:

```js
typescript: { ignoreBuildErrors: true }
```

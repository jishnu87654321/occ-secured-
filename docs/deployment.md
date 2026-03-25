# OCC Deployment

OCC is deployed as:

- frontend: Vercel (`occ/frontend`)
- backend: Render (`occ/backend`)

## Frontend on Vercel

Project settings:

- Framework preset: `Next.js`
- Root directory: `occ/frontend`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: leave empty

Required environment variables:

```env
NEXT_PUBLIC_API_URL="https://your-backend-service.onrender.com"
```

If you use a custom domain for the frontend, point it to the Vercel project and keep the backend URL here, not the frontend URL.

## Backend on Render

Render blueprint already exists in [render.yaml](/D:/occ%20securd%20-3/occ%20application%203/render.yaml).

Service settings:

- Root directory: `occ/backend`
- Build command: `npm run render:build`
- Start command: `npm run render:start`

Current optimized behavior:

- build step installs deps with `npm ci`
- Prisma client is generated during build
- Prisma schema is pushed during build, not on every boot
- runtime starts with plain `node dist/server.js`

Required environment variables:

```env
NODE_ENV="production"
PORT="10000"
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
JWT_ACCESS_SECRET="replace-with-a-strong-secret-at-least-32-chars"
JWT_REFRESH_SECRET="replace-with-a-different-strong-secret-at-least-32-chars"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
CORS_ORIGIN="https://your-frontend.vercel.app,https://your-custom-domain.com"
APP_URL="https://your-frontend.vercel.app"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="replace-with-a-strong-admin-password"
UPLOAD_DIR="/var/data/uploads"
```

Optional email variables:

```env
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="smtp-user"
SMTP_PASS="smtp-password"
SMTP_FROM="noreply@offcampusclub.com"
```

## Notes

- `CORS_ORIGIN` should include the exact Vercel production domain and any custom frontend domain you use
- if you want Vercel preview deployments to call Render, also include the relevant Vercel domain pattern in your allowed origins strategy
- keep backend secrets only in Render, not in frontend env files
- keep `NEXT_PUBLIC_API_URL` frontend-only and never expose backend secrets through Vercel env

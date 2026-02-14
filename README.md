# MicroCred FE

Frontend repository for MicroCred platform.

## Stack
- Next.js (App Router + TypeScript)
- Tailwind CSS
- ESLint

Codebase lives in `frontend/`.

## Branching Model
- `main`: production-ready branch
- `develop`: integration branch
- `feature/*`: short-lived feature branches

Recommended flow:
1. Create branch from `develop` (`feature/xxx`)
2. Open PR to `develop`
3. After QA, PR `develop -> main`
4. Deploy FE from `main`

## Backend Integration
Backend is already live on Render.

Set FE env:
- `NEXT_PUBLIC_API_URL=https://<your-backend-render-domain>`

See `frontend/.env.example`.

## Local Development
```bash
cd frontend
npm ci
npm run dev
```

## Quality Checks
```bash
cd frontend
npm run lint
npm run build
```

## GitHub Setup (First Time)
This repo is local-first and can be linked to a new GitHub repo:

```bash
git remote add origin git@github.com:<your-username>/<your-fe-repo>.git
git push -u origin main
git push -u origin develop
```

## CI
GitHub Actions workflow:
- `.github/workflows/frontend-ci.yml`

Runs on push/PR:
- `npm ci`
- `npm run lint`
- `npm run build`

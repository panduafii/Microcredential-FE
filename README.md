# MicroCred FE

Frontend repository for the MicroCred platform.

## Stack
- Next.js (App Router + TypeScript)
- Tailwind CSS
- ESLint

Primary app code lives in `frontend/`.

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

Set FE environment variable:
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

## CI
GitHub Actions workflow:
- `.github/workflows/frontend-ci.yml`

Runs on push/PR:
- `npm ci`
- `npm run lint`
- `npm run build`

## Notes
- API integration helper lives in `frontend/src/lib/api.ts`.
- Data contracts live in `frontend/src/types/api.ts`.
- FE guides live in `docs/`.

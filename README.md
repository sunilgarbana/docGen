# DocGen

**Auto-generate docs from your codebase in seconds.**
DocGen is an AI-powered documentation generator. Paste a GitHub repo URL and get beautiful, always-up-to-date documentation instantly.

## Architecture
- **Frontend**: React, Vite, Zustand, Tailwind CSS
- **Backend**: Node.js, Express, Prisma (PostgreSQL), BullMQ (Redis)
- **AI Core**: OpenAI GPT-4o API 

## Quick Start (Local Development)
1. Clone the repository locally.
2. Install dependencies:
   ```bash
   cd frontend && npm install
   cd ../backend && npm install
   ```
3. Boot the required infrastructure (Redis + Postgres). _In local dev, SQLite `dev.db` is used._
4. Copy `.env.example` to `.env` in both `frontend` and `backend` resolving secrets.
5. Run locally:
   ```bash
   # From frontend/
   npm run dev

   # From backend/
   npm run dev
   ```

## Setup CI/CD (GitHub Actions)
You can automatically trigger DocGen whenever you push code by deploying this Github Action.

1. Drop the following into your repository at `.github/workflows/docgen.yml`:

```yaml
name: DocGen — Auto Documentation
on:
  push:
    branches: [main]

jobs:
  generate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Generate docs
        run: |
          curl -X POST https://your-railway-url.up.railway.app/api/jobs/webhook \
            -H "Content-Type: application/json" \
            -d '{"repoUrl": "${{ github.repositoryUrl }}", "commitHash": "${{ github.sha }}", "secret": "${{ secrets.DOCGEN_SECRET }}"}'
```

2. Go to your repository **Settings > Secrets and variables > Actions**
3. Create a **New repository secret**:
   - Name: `DOCGEN_SECRET`
   - Value: Get this from the `WEBHOOK_SECRET` environment variable deployed within your backend.

Every time you commit to `main`, Docgen will quietly ingest your codebase and regenerate your interactive markdown documents within seconds!

#!/usr/bin/env bash
set -euo pipefail

# KT Rebuild Script (Reference)
# Purpose:
# - Recreate this Next.js + Amplify Gen 2 Todo app from scratch.
# - Capture command intent for knowledge transfer.
#
# Usage:
# - Read end-to-end first.
# - Run line-by-line in a fresh workspace.
# - Some steps are manual or AI-assisted and are marked clearly.

echo "== 0) Create parent workspace =="
echo "WHY: Keep backend (../amplify) and frontend (./next-amplify-crud) as sibling folders."
mkdir -p demo
cd demo

echo "== 1) Initialize parent Node workspace =="
echo "WHY: Parent repo owns Amplify backend toolchain."
npm init -y
npm install -D @aws-amplify/backend @aws-amplify/backend-cli aws-cdk-lib constructs esbuild tsx typescript
npm install aws-amplify

echo "== 2) Scaffold Next.js frontend app =="
echo "WHY: Creates App Router TypeScript project used for Todo UI."
npx create-next-app@latest next-amplify-crud --ts --eslint --app --src-dir --import-alias "@/*"

echo "== 3) Enter frontend and install runtime deps =="
echo "WHY: Frontend talks to Amplify Data API at runtime."
cd next-amplify-crud
npm install aws-amplify

echo "== 4) Create Amplify backend folder in parent =="
echo "WHY: Amplify Gen 2 backend source of truth for auth + data schema."
mkdir -p ../amplify/auth ../amplify/data

echo "== 5) Write backend definition files (manual edit) =="
echo "WHY: defineBackend(auth, data) composes backend resources."
echo "FILES:"
echo "  ../amplify/backend.ts"
echo "  ../amplify/auth/resource.ts"
echo "  ../amplify/data/resource.ts"

echo "== 6) Backend sandbox deploy =="
echo "WHY: Provisions cloud sandbox and generates ../amplify_outputs.json for frontend config."
cd ..
npx ampx sandbox

echo "== 7) Sync outputs into frontend =="
echo "WHY: Frontend reads local amplify_outputs.json during Amplify.configure()."
cd next-amplify-crud
cp ../amplify_outputs.json ./amplify_outputs.json

echo "== 8) Add sync helper script =="
echo "WHY: Standardizes config copy operation for daily dev."
echo "Add this in next-amplify-crud/package.json scripts:"
echo '  "sync:amplify": "cp ../amplify_outputs.json ./amplify_outputs.json"'

echo "== 9) Implement frontend integration (manual edit) =="
echo "WHY: Wire Amplify configure + Data client + Todo CRUD handlers."
echo "FILES:"
echo "  src/lib/amplify-client.ts"
echo "  src/app/page.tsx"

echo "== 10) Run frontend =="
echo "WHY: Validate end-to-end create/read/update/delete flow."
echo "Run manually in terminal:"
echo "  npm run dev"
echo "Then open http://localhost:3000 and verify CRUD."

echo "== 11) Optional quality checks =="
echo "WHY: Catch lint/type issues before handoff."
npm run lint
npm run build

echo "KT rebuild script complete."

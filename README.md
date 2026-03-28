# Amplify Todo (Next.js)

This app is a Todo CRUD frontend built with Next.js and wired to an AWS Amplify Gen 2 backend.

## Prerequisites

- Node.js 20+
- AWS credentials configured locally
- Amplify backend files in the parent folder: `../amplify`

## 1) Start Amplify Backend Sandbox

Run this from the parent project directory:

```bash
cd ..
npx ampx sandbox
```

This generates `../amplify_outputs.json`.

## 2) Sync Backend Outputs Into Next App

From this folder (`next-amplify-crud`):

```bash
npm run sync:amplify
```

## 3) Run The App

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Features

- Create Todo
- Read/list Todos
- Toggle completion
- Delete Todo
- Edit Todo via Amplify REST API (`PATCH /todos/{id}` on API Gateway)

## Amplify REST + GraphQL (Demo)

This project now uses both:

- GraphQL (AppSync + Amplify Data) for list/create/toggle/delete
- REST (Amplify-provisioned API Gateway + Lambda) for edit

After backend changes, re-run:

```bash
cd ..
npx ampx sandbox
```

Then sync outputs again in this app:

```bash
npm run sync:amplify
```

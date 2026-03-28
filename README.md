# Amplify Todo (Next.js 16)

Todo board for engineering delivery workflows using Next.js + Amplify Gen 2.

## Stack

- Next.js 16 + React 19
- Amplify Data (AppSync GraphQL)
- Amplify-provisioned API Gateway + Lambda (`restTodo`) for REST paths

## Prerequisites

- Node.js 20+
- AWS credentials configured locally
- Backend definitions available (see notes below)

## Backend Location Notes

- Sandbox deployment is typically run from the parent folder backend: `../amplify`.
- This app also contains `./amplify` type definitions used by imports like `amplify/data/resource.ts`.
- Keep both backend definition folders aligned if you edit schema or function contracts.

## Local Run

1. From parent folder, deploy/update backend sandbox:

```bash
cd ..
npx ampx sandbox
```

This writes `../amplify_outputs.json`.

2. From `next-amplify-crud`, sync outputs:

```bash
npm run sync:amplify
```

3. Install and run frontend:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Current API Behavior

- List todos: GraphQL `Todo.list()`
- Create todo: REST `POST /todos` (fallback to GraphQL create if REST endpoint is unavailable)
- Edit/toggle/status note: REST `PATCH /todos/:id`
- REST-unavailable fallback for updates: Next route handler `PATCH /api/todos/:id`
- Delete todos: GraphQL `Todo.delete()`
- Bulk clear completed: GraphQL delete per completed todo

## Current UI Capabilities

- Create task with title, Jira key, and description
- Search, status filters, Jira-only filter, and sorting
- Inline edit for title/Jira/description + optional status note
- Quick status-note logging
- Status history timeline per task
- Bulk actions: `Mark All Open Done`, `Clear Completed`
- Jira base URL setting persisted in local storage

## Validation Commands

```bash
npm run lint
npm run build
```

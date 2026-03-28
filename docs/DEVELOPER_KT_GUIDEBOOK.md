# Developer KT Guidebook: Next.js + Amplify Jira Todo

This KT document is aligned with the current project implementation (March 28, 2026).

- Frontend: Next.js app in `next-amplify-crud`
- Backend: Amplify Gen 2 project in `../amplify`
- API style: GraphQL and REST together

## 1) What This App Does Now

- Tracks tasks with manual Jira ticket key.
- Stores task description for implementation detail.
- Logs status timeline (`statusLogs`) for done/open transitions and manual notes.
- Uses both GraphQL and REST in one app.

## 2) Command Runbook (Command + Why)

| Step | Command | Why this command is used |
|---|---|---|
| 1 | `cd /Users/novigi/Desktop/Demo` | Move to parent directory containing both `amplify` and `next-amplify-crud`. |
| 2 | `npx ampx sandbox` | Provision or update backend resources (AppSync, auth, REST API Gateway, Lambda). |
| 3 | `cd next-amplify-crud` | Move into frontend app folder. |
| 4 | `npm run sync:amplify` | Copy generated `../amplify_outputs.json` into frontend as runtime config. |
| 5 | `npm install` | Install frontend dependencies. |
| 6 | `npm run dev` | Start local development server. |
| 7 | `npm run lint` | Static quality check before handoff. |
| 8 | `npm run build` | Production build verification. |
| 9 | `npx tsc -p ../amplify/tsconfig.json --noEmit` | Validate backend TypeScript definitions and Lambda/backend code compile state. |

## 3) Backend Files and Why They Exist

| File | Purpose |
|---|---|
| `../amplify/data/resource.ts` | Defines `Todo` model fields (`content`, `jiraTicket`, `description`, `isDone`, `statusLogs`) and guest authorization. |
| `../amplify/backend.ts` | Composes backend resources and provisions REST API routes via API Gateway + Lambda integration. |
| `../amplify/functions/rest-todo/resource.ts` | Declares Lambda function resource metadata. |
| `../amplify/functions/rest-todo/handler.ts` | REST handler that bridges API requests to AppSync and appends status logs. |

## 4) Frontend Files and Why They Exist

| File | Purpose |
|---|---|
| `src/lib/amplify-client.ts` | Amplify bootstrap, config guard, and REST endpoint lookup from outputs. |
| `src/app/page.tsx` | Main board UI, filters, create/edit/toggle/delete, quick note logging, Jira open links. |
| `src/app/api/todos/[id]/route.ts` | Local PATCH fallback when Amplify REST endpoint is unavailable in outputs. |
| `src/app/layout.tsx` | Global font setup and app metadata. |
| `src/app/globals.css` | Shared visual system classes and page-level theme styling. |

## 5) API Split (Important KT)

| Operation | Route / Method | Path in code |
|---|---|---|
| List todos | GraphQL `Todo.list()` | `src/app/page.tsx` |
| Create todo | REST `POST /todos` (preferred) | `src/app/page.tsx` + `../amplify/functions/rest-todo/handler.ts` |
| Edit todo | REST `PATCH /todos/:id` | same as above |
| Toggle status | REST `PATCH /todos/:id` with `isDone` | same as above |
| Add status note | REST `PATCH /todos/:id` with `statusNote` | same as above |
| Delete todo | GraphQL `Todo.delete()` | `src/app/page.tsx` |

Why split this way:
- Demonstrates both GraphQL and REST in one app for demo.
- Keeps status logging logic centralized in REST update flow.

## 6) Typical Developer Workflow (Daily)

1. Update backend definitions if schema/API changes are required.
2. Run `npx ampx sandbox` in parent folder.
3. Run `npm run sync:amplify` inside frontend.
4. Use `npm run dev` and verify create/edit/toggle/log/delete flows.
5. Run `npm run lint` and `npm run build` before pushing/handoff.

## 7) Validation Checklist for KT Handover

- Can create task with:
  - title
  - Jira key
  - description
- Can toggle open/done and see status history entry appended.
- Can add quick status note and see history entry appended.
- Can edit title/Jira/description without regression.
- Jira link opens using configured Jira base URL.
- Build and lint pass.

## 8) Troubleshooting

### Symptom: Amplify is not configured
- Cause: `amplify_outputs.json` missing or stale.
- Fix:
  1. `cd .. && npx ampx sandbox`
  2. `cd next-amplify-crud && npm run sync:amplify`

### Symptom: REST endpoint missing
- Cause: old outputs file without `custom.todo_rest_api_endpoint`.
- Fix: rerun sandbox and sync outputs.

### Symptom: UI works but status logs not updating
- Cause: PATCH not reaching REST path or fallback route mismatch.
- Fix: verify `src/app/api/todos/[id]/route.ts` and `../amplify/functions/rest-todo/handler.ts` are aligned.

## 9) Suggested Prompt Pack (For Rebuilding)

### Prompt A: Amplify Data Model + REST
```text
Implement Amplify Gen 2 backend for Todo with fields: content(required), jiraTicket, description, isDone(default false), statusLogs(string[]).
Provision REST API Gateway with routes GET/POST /todos and GET/PATCH/DELETE /todos/{id} using Lambda.
Lambda should call AppSync and append statusLogs on status updates.
```

### Prompt B: Next.js UI
```text
Build a developer-oriented Todo board UI with manual Jira ticket input, description, status filters, sorting, and status history viewer.
Use GraphQL for list/delete and REST for create/edit/toggle/status-note logging.
Include clear loading/error states and responsive layout.
```

### Prompt C: Fallback Route
```text
Create Next.js Route Handler PATCH /api/todos/[id] as fallback when REST endpoint is unavailable.
Support content, jiraTicket, description, isDone, statusNote and append statusLogs similarly to Lambda behavior.
```

## 10) Production Hardening Notes

- Replace `allow.guest()` with role/user-based authorization.
- Add audit identity metadata (who changed status).
- Consider structured status log entity instead of string array for analytics and reporting.

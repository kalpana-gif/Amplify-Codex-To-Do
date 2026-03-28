# Next + Amplify Jira Todo Architecture (Developer Design Document)

This document reflects the current implementation in this repository as of March 29, 2026.

- Frontend: `next-amplify-crud` (Next.js 16 + React 19)
- Backend definitions: `../amplify` (sandbox deploy source), mirrored in `next-amplify-crud/amplify` for local schema typing
- Runtime bridge: `amplify_outputs.json`

## 1) System Context

```mermaid
flowchart LR
    Dev[Developer]
    Browser[Browser]
    NextUI["Next.js App UI\nsrc/app/page.tsx"]
    AmplifyJS["aws-amplify v6\nconfigure + generateClient"]
    AppSync["AppSync GraphQL API"]
    RestApi["API Gateway HTTP API\n/todos"]
    Lambda["Lambda restTodo handler"]
    Data[(Todo Model in Amplify Data)]
    Auth["Identity Pool (guest IAM)"]

    Dev --> Browser
    Browser --> NextUI
    NextUI --> AmplifyJS
    AmplifyJS --> AppSync
    NextUI --> RestApi
    RestApi --> Lambda
    Lambda --> AppSync
    AppSync --> Data
    AmplifyJS --> Auth
```

## 2) Repository and Module Architecture

```mermaid
flowchart TB
    subgraph Frontend["/next-amplify-crud"]
      P1["src/app/page.tsx\nUI + filters + task actions"]
      P2["src/app/api/todos/[id]/route.ts\nLocal PATCH fallback"]
      P3["src/lib/amplify-client.ts\nAmplify bootstrap + outputs helpers"]
      P4["src/app/layout.tsx\nGlobal font + metadata"]
      P5["src/app/globals.css\nTheme + reusable surface classes"]
      P6["amplify_outputs.json\nData API + custom REST endpoint"]
      P7["amplify/data/resource.ts\nLocal schema type mirror"]
    end

    subgraph Backend["../amplify"]
      B1["data/resource.ts\nTodo schema"]
      B2["backend.ts\nauth + data + rest API wiring"]
      B3["functions/rest-todo/handler.ts\nREST CRUD bridge"]
    end

    P1 --> P3
    P1 --> P2
    P1 -.type imports.-> P7
    P2 -.type imports.-> P7
    P3 --> P6
    B2 --> B1
    B2 --> B3
    B2 -.outputs.-> P6
```

## 3) Data Model (Current)

```mermaid
classDiagram
    class Todo {
      +id: ID
      +content: String (required)
      +jiraTicket: String (optional)
      +description: String (optional)
      +isDone: Boolean (default false)
      +statusLogs: String[] (optional)
      +createdAt: AWSDateTime
      +updatedAt: AWSDateTime
    }
```

Model source of truth: `../amplify/data/resource.ts`.

## 4) API Responsibility Matrix

| User action | Primary path | Fallback path | Why |
|---|---|---|---|
| List tasks | GraphQL `Todo.list()` | N/A | Direct model read via generated client is simple and strongly typed. |
| Create task | REST `POST /todos` | GraphQL `Todo.create()` when REST endpoint unavailable | REST centralizes status log initialization in backend. |
| Edit title/Jira/description | REST `PATCH /todos/:id` | Next route `PATCH /api/todos/:id` | Keeps update validation and status-note logging consistent. |
| Toggle done/open | REST `PATCH /todos/:id` with `isDone` | Next route fallback | Enables automatic status history entries for state transitions. |
| Add quick status note | REST `PATCH /todos/:id` with `statusNote` | Next route fallback | Lightweight operational logging without editing full task. |
| Delete task | GraphQL `Todo.delete()` | N/A | Straightforward delete path via generated client. |
| Mark all open as done | REST `PATCH /todos/:id` in parallel | Next route fallback per item | Reuses the same status-change logging contract for each task. |
| Clear completed | GraphQL `Todo.delete()` in parallel | N/A | Fast bulk cleanup of completed items. |

## 5) Runtime Sequence (Edit/Toggle/Note)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant UI as page.tsx
    participant R as REST Endpoint
    participant L as restTodo Lambda
    participant G as AppSync
    participant D as Todo Model

    U->>UI: Edit content / toggle status / log note
    UI->>R: PATCH /todos/{id}
    R->>L: Invoke Lambda
    L->>G: getTodo(id)
    L->>L: build next statusLogs entry
    L->>G: updateTodo(input)
    G->>D: Persist
    D-->>G: Updated Todo
    G-->>L: Result
    L-->>UI: 200 { data }
    UI->>G: Todo.list() refresh
    UI-->>U: Updated board + history
```

## 6) UX Design Intent (Current Board)

### 6.1 Visual System
- Warm layered background (`app-shell`) for contrast without dark-mode dependency.
- Glass-like surfaces (`glass-panel`, `glass-panel-strong`) to separate board and side panel.
- State color language:
  - Open: slate
  - Done: emerald
  - Jira links: sky

### 6.2 Workflow Enhancements
- KPI tiles for total/open/completed/completion percentage.
- Inline create section with task title + Jira + description.
- Filter + sort controls (`All/Open/Done`, `Newest/Updated/Jira`, Jira-only toggle).
- Quick status-note input on each task card (no need to enter edit mode).
- Expandable status history timeline per task.

### 6.3 Interaction Guarantees
- Bulk actions are explicit and button-driven (`Mark All Open Done`, `Clear Completed`).
- PATCH operations preserve existing behavior and append logs.
- Explicit loading/disabled states for create/edit/toggle/log/delete and bulk actions.

## 7) Security and Auth

- Data schema uses `allow.guest()` for demo velocity.
- Authorization mode is `identityPool` (AWS IAM guest auth enabled).
- This is demo-friendly; production should tighten model auth rules and remove broad guest access.

## 8) Local Development Lifecycle

```mermaid
flowchart TD
    A1["1. cd .. && npx ampx sandbox"]
    A2["2. Generate ../amplify_outputs.json"]
    A3["3. cd next-amplify-crud && npm run sync:amplify"]
    A4["4. npm run dev"]
    A5["5. Verify lint/build before handoff"]

    A1 --> A2 --> A3 --> A4 --> A5
```

## 9) Current Tradeoffs and Next Evolution

- List/delete/clear-completed remain GraphQL while create/edit/toggle/note and mark-all-done use REST; this hybrid is intentional for demoing both patterns.
- UI still refreshes with full `Todo.list()` after each mutation (correctness over minimal reads).
- `statusLogs` is plain string array for speed; future improvement can move to structured log model (`TodoStatusEvent`) for analytics.

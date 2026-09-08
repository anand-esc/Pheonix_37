# Phoenix UI Kit

Real, framework-agnostic React + CSS components matching the navy/gold/red design direction.
Drop this folder into your `src/` and build every page from these pieces.

## Setup

```bash
npm install @tabler/icons-react
```

Copy this whole `phoenix-ui-kit/` folder into your project (e.g. `src/components/phoenix-ui-kit/`),
then import `tokens.css` **once** at your app root:

```jsx
// main.jsx or App.jsx
import './components/phoenix-ui-kit/tokens.css';
```

## What's in here

| File | What it is |
|---|---|
| `tokens.css` | The color/type/spacing system. Everything else reads from these variables — change a value here and it updates everywhere. |
| `CaseHeader.jsx` | Navy header bar with a gold/red status badge. |
| `ChainOfCustody.jsx` | The hash-chain ledger timeline — data-driven, maps straight from `GET /api/case/{id}/ledger`. |
| `FragmentRow.jsx` | A structured fragment log row (not a card) — confidence score and rationale always shown together. |
| `ExampleCasePage.jsx` | Reference page showing all three wired together with sample data. Copy this pattern for real pages, replacing the hardcoded arrays with real `fetch()` calls. |

## The color rule — don't break this

- **Navy** — structural chrome only (headers, nav, dividers). Always present, never a signal.
- **Gold** — reserved *only* for validated/certified states. Don't use it as a generic "nice accent" anywhere else, or it stops meaning anything.
- **Red** — reserved *only* for integrity failures (tamper detected, verification failed). Never use it for anything else — including "delete" buttons or generic warnings — the whole point is that seeing red on this app means something specific happened.

## Extending this

To add a new page (dashboard, video viewer), start from `ExampleCasePage.jsx`'s pattern:
1. Fetch real data from the backend
2. Compose it from `CaseHeader` + whatever new components you build
3. Any new "status" concept should map to gold (certified) / red (failed) / navy-neutral (in progress) — don't introduce a fourth semantic color without a reason as specific as these three.

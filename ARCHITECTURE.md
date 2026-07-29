# Architecture

How this codebase is organised, and why. Read this before adding a feature — the
patterns matter more than any individual screen.

---

## Frontend: feature-sliced, not type-sliced

The common mistake is folders named `components/`, `pages/`, `hooks/`, `utils/`.
It looks tidy on day one and becomes unusable by month three, because one change
to "properties" touches four folders and nothing tells you what belongs together.

Here, code is grouped by **what it is for**:

```
src/
├── design-system/     Everything reusable and domain-agnostic
├── features/          One folder per area of the product
│   ├── properties/    PropertiesPage, PropertyPage, PropertyForm, PhotoManager
│   ├── applicants/
│   ├── diary/
│   ├── compliance/
│   ├── maintenance/
│   ├── documents/
│   └── listings/      The AI listing studio
├── layout/            AppShell, sidebar, topbar, command palette
├── lib/               api client, formatting, hooks, auth, theme
└── app/               Router and provider composition
```

**The dependency rule, and it only points one way:**

```
features  →  design-system  →  (nothing)
features  →  lib            →  (nothing)
design-system  ↛  features
```

A design-system component must never import from `features/`. If a component
needs to know what a "property" is, it belongs in the feature, not the system.
Break this rule once and the design system stops being extractable.

## The design system

`design-system/index.js` is the only import path features use:

```js
import { Card, Table, Button, useToast } from '../../design-system';
```

Not `'../../design-system/components/Button/Button'`. The barrel is the public
API; anything behind it can be reorganised freely.

Components are grouped by role, not one-per-file: `Form/` exports `Field`,
`Input`, `Select`, `Textarea`, `Checkbox`, `Segmented` and `SearchInput`,
because they change together and are always used together.

---

## CSS: two token tiers and one declared cascade

### Tier 1 — primitives (`tokens.css`)

Raw values with no opinion about use: `--grey-200`, `--space-4`, `--text-md`.
**Nothing in the app references these directly.**

### Tier 2 — semantics (`themes.css`)

Named for the job they do: `--surface-card`, `--border-subtle`,
`--text-secondary`, `--danger-subtle`. Components only ever use these.

That indirection is the whole trick. A component asking for `--border-subtle`
keeps working when light mode maps it to `--grey-200` and dark maps it to
`#1e2c29`. Adding a third theme is one block in one file.

### The cascade is declared, not discovered

```css
@layer tokens, base, components, utilities, overrides;
```

A later layer beats an earlier one **regardless of specificity**. A single-class
component style overrides an element selector in `base` without a fight. This is
why there is no `!important` anywhere in the codebase, and why nobody has to
write `.card .header h2.title` to win an argument with the cascade.

### CSS Modules for components

Every component has a co-located `.module.css`. Class names are hashed at build
time, so `.header` in `Card.module.css` cannot collide with `.header` anywhere
else. No BEM, no naming convention to remember, no global namespace to protect.

### The utility layer is deliberately tiny

`utilities.css` has about fifteen classes — `.stack`, `.row`, `.cols-3`,
`.label`, `.num`, `.muted`. Layout rhythm only. **If you find yourself using the
same three utilities together twice, make a component instead.** This is not
Tailwind and should not grow into it.

---

## Backend: routes thin, services thick

```
api/src/
├── routes/       HTTP only: parse, validate, call a service, shape a response
├── services/     The actual thinking
│   ├── matching.js    applicant ⇄ property scoring
│   └── ai/
│       ├── provider.js  which model, or none
│       └── listing.js   the two-stage prompt chain
├── middleware/   auth and agency scoping
├── lib/          validation, errors, password hashing, helpers
└── db/           schema, connection, seed
```

Route handlers stay short enough to read in one screen. Anything with a rule in
it — how a match is scored, how a document is chunked, what makes copy
non-compliant — lives in `services/` where it can be tested without HTTP.

### Multi-tenancy is not optional

Every table has `agency_id`. Every query filters on `req.agencyId`, which comes
from the signed token and **never** from the request body or a URL parameter. A
tenant leak is the one bug that ends a B2B SaaS, so this is a habit, not a
feature.

### Money is integer pence

Never floats. Converted to pounds in exactly one place: `web/src/lib/format.js`.

### Adapters at every external boundary

Three places talk to the outside world, and each hides behind an interface:

| Boundary | Interface | Today | Later |
|---|---|---|---|
| Database | `db.all/get/run` | SQLite | Postgres — one file changes |
| Retrieval | `answerQuestion()` | BM25 | Embeddings + pgvector |
| Copywriting | `provider.complete()` | Local writer | GPT-4o / Claude vision |
| File storage | `routes/media.js` | Local disk | S3 or Supabase Storage |

Each one **works today** without an account, a key or a card. That is the point:
the product is demoable from a laptop on a train, and upgrading any single
boundary is a contained change rather than a rewrite.

---

## The listing generator, specifically

Two prompts, never one.

**Stage 1 only looks.** Returns JSON: features visible in the photographs,
condition, rooms. No prose, no marketing language.

**Stage 2 only writes.** Receives that JSON plus the agent's typed facts, and is
forbidden from using anything else.

Splitting them buys three things:

1. **Debuggability.** When copy is wrong you can see whether the model mis-saw
   the room or mis-wrote the sentence. A single mega-prompt gives you no handle.
2. **Cheapness.** Stage 1 needs a vision model; stage 2 does not. Route stage 2
   to a smaller model and most of the cost disappears.
3. **Compliance.** The rules live in stage 2's system prompt *and* are checked
   again in code afterwards by `auditCopy()`. Property advertising is governed by
   the Consumer Protection Regulations — invented features are not a bug, they
   are a legal problem. Never trust a model to police itself.

---

## Conventions

- **Loading is a skeleton, not a spinner.** A shape matching the incoming content
  makes the wait feel shorter and stops the layout jumping.
- **Every empty state says what to do next**, never just "no data".
- **Every destructive or slow action gets a toast.** Silence reads as a bug.
- **Errors are objects with fields.** The API returns `{ error, fields: [...] }`
  so a form can highlight the offending input rather than shrugging.
- **`useAsync` everywhere.** It returns `{ loading, error, data, reload }` and
  ignores responses from superseded requests, which is what stops fast filter
  typing from rendering stale results.

## Adding a feature

1. Make `features/<name>/`.
2. Build the page from `design-system` components. If a piece is missing, ask
   whether it is domain-agnostic — if yes it goes in the design system, if no it
   stays in the feature folder.
3. Add API calls to `lib/api.js` and nowhere else.
4. Add the route in `app/App.jsx` and the nav entry in `layout/AppShell.jsx`.
5. If it has a rule in it, that rule goes in `api/src/services/`, not a route.

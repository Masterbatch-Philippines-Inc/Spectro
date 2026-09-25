# static/

All frontend assets: CSS (Tailwind v4), vanilla JS modules (no framework, no bundler beyond Tailwind's own CLI), and images.

## Tree

```
static/
├── css/
│   ├── input.css                   # Tailwind v4 entrypoint (@import "tailwindcss"; @theme {...})
│   ├── design-tokens.css           # CSS custom properties: light/dark HSL tokens, keyframes,
│   │                               # stepper (.ts-*) and sticky-table CSS not expressible in Tailwind alone
│   └── output.css                  # BUILD OUTPUT — compiled by `pnpm run dev:css` / `build:css`, never hand-edited
├── img/
│   └── spectro.svg                 # app icon/logo, referenced via {% static %}
└── js/
    ├── base.js                     # entrypoint: waits for DOM, calls initApp()
    └── shared/
        ├── app.js                  # single orchestrator — imports + calls every component's init*()
        ├── global/                 # once-per-page structural behavior
        │   ├── sidebar.js
        │   ├── header.js
        │   ├── footer.js
        │   ├── modal.js
        │   ├── theme_boot.js
        │   ├── toast.js
        ├── ui/                     # reusable, parameterized building blocks
        │   ├── table.js, 
        │   ├── dropdown.js
        │   ├── forms.js
        │   ├── tooltip.js
        │   ├── scatter_graph.js
        │   ├── search_mentions.js
        │   ├── color_offset.js
        │   ├── color_simulation.js
        ├── pages/                  # one file per page, page-specific wiring only
        │   ├── samples_reader.js   # the 3-step wizard (connect/calibrate -> standard -> samples)
        │   └── samples_record.js   # the Samples Record data table + scatter graph + export
        └── utils/
            ├── csrf.js             # reads csrftoken cookie for AJAX headers
            ├── instrument_env.js   # reads window.SPECTRO_ENV (DEV_INSTRUMENT_SOURCE flag)
            └── instrument_dev.js   # single choke point for all calls to the local agent
                                    # (localhost:5151) OR fake DEV-mode data, same return shape either way
```

## Why it's built this way

- **No bundler, no framework.** Everything is plain ES modules loaded via `<script type="module">`. `base.js` is the only entrypoint declared in `templates/base.django`; it imports `app.js`, which imports and calls every other module's `init*()` function. Adding a new shared behavior = write the module, import + call it in `app.js`.
- **`global/` vs `ui/` split mirrors `templates/components/shared/global/` vs `ui/`.** Global JS assumes its target markup exists once per page (sidebar, header, toasts, modals). UI JS is written to work generically off data attributes (`data-modal`, `data-dropdown-menu`, `data-tooltip`, `data-combobox`) so the same script drives many instances of a component with zero page-specific wiring.
- **`pages/` files are the only page-specific JS.** They're conditionally initialized in `app.js` based on which DOM anchor element exists (`#dataTable` + `window.SAMPLES_RECORD_URLS` → `samples_record.js`; `#connectBtn` + `window.SAMPLES_READER_URLS` → `samples_reader.js`). These globals are injected inline by the matching Django template.
- **`instrument_dev.js` isolates all hardware calls.** `samples_reader.js` never calls `fetch('http://localhost:5151/...')` directly — everything routes through this file, which either hits the real local agent or returns fake-but-plausible data when `DEV_INSTRUMENT_SOURCE=True` (set server-side via `.env`, read at request time). This lets the wizard's UI/logic be developed on a machine with no spectrometer attached.
- **`table.js`, `scatter_graph.js`, `search_mentions.js` are generic engines, not page code.** They take a config object (columns, callbacks, a `getDataset()` function) from the page module instead of knowing about Samples Record or Samples Reader specifically — both pages reuse the exact same table/graph code.
- **`design-tokens.css` exists outside Tailwind's own layer** for things Tailwind v4 utility classes can't cleanly express: HSL custom properties that flip under `.dark`, `@keyframes`, and structural component CSS (stepper circles/lines, sticky table headers/columns) that's shared across pages.

## Links to other folders

- `templates/` — every template extends `base.django`, which is the only place `static/js/base.js` and `static/css/output.css` are loaded (via `{% static %}`). Page templates additionally inline `window.SAMPLES_*_URLS` / `window.SPECTRO_ENV` objects that the matching `static/js/shared/pages/*.js` file reads on load — this is the sole hand-off point between server-rendered URLs/flags and client JS. Components under `templates/components/shared/ui/` (`table.django`, `dropdown.django`, `scatter_graph.django`, `modals.django`, `tooltip.django`) each expect a specific `static/js/shared/ui/*.js` file to already be running via `app.js`.
- `apps/spectro/` — every `fetch()` call in `pages/*.js` targets a URL name defined in `apps/spectro/urls.py` and served by a function in `apps/spectro/modules/*.py`. Response JSON shape (`{tone, message, ...}`) is a contract with `forms.js`/`toast.js` and with the page module's own `.then()` handlers.
- Tailwind build (`package.json` / `pnpm-lock.yaml` at repo root) compiles `css/input.css` + `css/design-tokens.css` → `css/output.css`; `output.css` is gitignored from hand-editing but checked in as the actual served file (see `.gitignore` / `apps/core/settings.py` `STATICFILES_DIRS`/`STATIC_ROOT`, served via whitenoise).
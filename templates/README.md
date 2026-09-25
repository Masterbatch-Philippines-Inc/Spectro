# templates/

Django templates. Shared-shell + component-library pattern: one base layout every page extends, plus a library of reusable includes split into structural (`global/`) and parameterized (`ui/`) pieces.

## Tree

```
templates/
├── base.django                        # shared shell: <head>, sidebar, header, {% block content %},
│                                      # footer, toast stack, tooltip shell, modals, base.js script tag
├── handlers/
│   └── status.django                  # single template for 400/403/404/500/503, driven by status.js
├── components/shared/
│   ├── global/                        # once-per-page structural includes
│   │   ├── sidebar.django             # nav + scatter graph + account menu, gated on user.is_authenticated
│   │   ├── header.django              # page title (per resolver_match.url_name) + theme toggle
│   │   ├── footer.django              # clock + version
│   │   └── modals.django              # global modal instances (e.g. scatterModal)
│   └── ui/                            # reusable, parameterized building blocks
│       ├── button.django
│       ├── input.django
│       ├── field.django
│       ├── dropdown.django
│       ├── forms.django               # AJAX form shell (data-ajax-form + CSRF + submit button)
│       ├── table.django               # empty table shell — columns/data supplied by page JS
│       ├── scatter_graph.django       # Δa*/Δb* SVG shell — page defines window.getScatterPlotPoints()
│       ├── toast.django               # #toastStack container
│       └── tooltip.django             # #uiTooltip shell, one instance reused via event delegation
└── pages/
    ├── auth/
    │   ├── login.django
    │   ├── password_reset_form.django
    │   ├── password_reset_done.django
    │   ├── password_reset_confirm.django
    │   ├── password_reset_complete.django
    │   ├── password_reset_email.django
    │   └── password_reset_subject.txt
    ├── samples_reader.django          # 3-step wizard: connect/calibrate -> product code/standard -> samples
    └── samples_record.django          # data table page (product code + standard filters, export, re-read)
```

## Why it's built this way

- **`base.django` is the only place structural includes are wired up.** Sidebar, header, footer, toast stack, tooltip shell, and the modal container are all included here, once. A new page template only ever needs `{% extends "base.django" %}` + `{% block content %}` — it never re-includes any of these itself.
- **`global/` vs `ui/` is an intentional split**, mirrored in `static/js/shared/global/` vs `ui/`: `global/` pieces assume exactly one instance per page and read `request.resolver_match.url_name` to highlight/label themselves; `ui/` pieces take explicit `{% include ... with %}` parameters (`btn_variant`, `dropdown_type`, `table_id`, etc.) and are dropped into as many places as needed with different config each time.
- **Components carry no data of their own.** `table.django` renders an empty `<table>` shell with configurable element IDs — the including page defines a `COLUMNS` array and dataset in its own `static/js/shared/pages/*.js` file and calls `createDataTable({...})`. Same pattern for `scatter_graph.django` (page must define `window.getScatterPlotPoints()`) and `forms.django` (page supplies field markup, gets CSRF + AJAX submit for free).
- **`dropdown.django` has three variants in one file** (`select` / `menu` / `combobox`) selected via `dropdown_type`, instead of three separate template files, since all three share the same JS init pattern in `dropdown.js`.
- **`handlers/status.django` is a single template for every HTTP error code.** The status code is dropped into a hidden `data-status-code` div; `static/js/handlers/status.js` reads it and fills in the icon/headline/message client-side, so adding a new status code config is a JS-only change, not a new template.
- **Auth templates stay flat under `pages/auth/`** rather than nested further, matching Django's built-in `auth_views` class-based views (`PasswordResetView`, etc.) which are wired directly in `apps/spectro/urls.py` with `template_name=` pointing here — no custom view functions needed for the reset flow.

## Links to other folders

- `apps/spectro/` — every template here is rendered by a `render()` call inside `apps/spectro/modules/*.py` (or by Django's built-in `auth_views`, configured with `template_name` in `apps/spectro/urls.py`). Context variables (`error`, `search_product_codes_url`, `product_code_options`, `dev_instrument_source`, `status_code`, `validlink`, `form`, ...) are the contract — a template referencing a context key means some view/module put it there.
- `static/` — `base.django` is the sole loader of `static/css/output.css` and `static/js/base.js` (via `{% load static %}` / `{% static %}`). Page templates in `pages/` additionally inline `<script>` blocks defining `window.SAMPLES_RECORD_URLS`, `window.SAMPLES_READER_URLS`, and `window.SPECTRO_ENV` — these are read by the matching file in `static/js/shared/pages/`, and are the only hand-off between server-side URL reversal and client JS. Every `ui/` component template expects its matching `static/js/shared/ui/*.js` initializer to be registered in `static/js/shared/app.js`.
- `apps/core/urls.py` — wires `handler400/403/404/500` to `apps/spectro/modules/handlers.py`, which renders `handlers/status.django`; `maintenance_view` renders the same template with a 503 for manual use.
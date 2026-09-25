# apps/

Top-level Python package holding every Django app in this project. Split into two apps by concern: project-wide config vs. actual product logic.

## Tree

```
apps/
├── __init__.py
├── core/                      # App 1 — project-wide config (see apps/core/README.md)
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py
│   ├── asgi.py
│   └── db_router.py
└── spectro/                   # App 2 — the actual product (see apps/spectro/README.md)
    ├── __init__.py
    ├── apps.py
    ├── urls.py
    ├── views.py
    ├── models/
    └── modules/
```

## Why it's built this way

- **Two apps, not one.** `core` never contains business logic — it only wires Django itself together (settings, root URLconf, WSGI/ASGI entrypoints, the DB router). `spectro` owns every model, view, and page. This keeps `INSTALLED_APPS`/`AUTH_USER_MODEL` config isolated from product code, so a second product app could be added later under `apps/` without touching `core` beyond one `INSTALLED_APPS` line and one `include()`.
- **`apps/__init__.py` is empty on purpose.** `apps` is a plain namespace package — Python needs it importable (`apps.core.settings`, `apps.spectro.views`) but it holds no shared code itself. Don't put shared utilities here; they'd have no natural owner between `core` and `spectro`.
- **Every settings-facing string points at `apps.<name>`.** `INSTALLED_APPS = ["apps.spectro"]`, `ROOT_URLCONF = "apps.core.urls"`, `AUTH_USER_MODEL = "spectro.User"` (label, not full path — see `apps/spectro/apps.py`'s `label = "spectro"`), `WSGI_APPLICATION = "apps.core.wsgi.application"`. Renaming either app folder means updating every one of these.

## Links to other folders

- `manage.py` — sets `DJANGO_SETTINGS_MODULE=apps.core.settings` before doing anything else; every management command (`makemigrations`, `migrate`, `runserver`) resolves through `apps/core/settings.py` first.
- `templates/` and `static/` — owned entirely by `apps/spectro/modules/*.py`'s `render()` calls and the templates' `{% static %}` tags; `apps/core` never renders a template or serves a static file directly (Whitenoise middleware, configured in `apps/core/settings.py`, does the actual serving).
- `.env` / `.env.example` — read exclusively by `apps/core/settings.py` via `python-decouple`'s `config()`. No other file in `apps/` touches environment variables directly.
- See `apps/core/README.md` and `apps/spectro/README.md` for what's inside each app specifically.
# apps/core/

Django project-config app. Holds `settings.py`, the root URLconf, WSGI/ASGI entrypoints, and the multi-database router. Contains **zero** business logic — everything here exists only to wire the rest of the project together.

## Tree

```
apps/core/
├── __init__.py
├── settings.py      # single source of truth for every Django setting
├── urls.py          # root URLconf — includes apps.spectro.urls, wires error handlers
├── wsgi.py           # WSGI entrypoint (production/sync serving)
├── asgi.py           # ASGI entrypoint (async-capable serving)
└── db_router.py      # routes QcProgramRecord reads/writes to the 'server' DB alias
```

## Why it's built this way

- **`settings.py` is the only place environment variables are read.** Every value comes through `python-decouple`'s `config()`, sourced from `.env` (see `.env.example` at the repo root) — `DJANGO_SECRET_KEY`, `DB_*`/`SERVER_DB_*` credentials, `EMAIL_*`, `DJANGO_DEV_INSTRUMENT_SOURCE`. No other file in the project calls `config()` directly; a new setting always gets added here first, then threaded through as a Django setting or template context variable.
- **Two database aliases, one router.** `DATABASES` defines `default` (this project's own tables) and `server` (an external QC program's Postgres instance, accessed as a read-mostly view). `DATABASE_ROUTERS = ["apps.core.db_router.QcProgramRouter"]` is the only thing that knows this split exists — every model except `QcProgramRecord` (`apps/spectro/models/spectro_models.py`) is untouched by it and stays on `default` via the router's fall-through `return None`.
- **`db_router.py` intercepts by app_label + model_name, not by import.** `QcProgramRouter` never imports `QcProgramRecord` itself — it matches on the string pair `("spectro", "qcprogramrecord")` so the router file has no hard dependency on the model file, and can't accidentally get invalidated if that model is refactored elsewhere.
- **`urls.py` stays a two-line router.** All actual page/API routes live in `apps/spectro/urls.py`; `apps/core/urls.py` only mounts `admin/`, includes `apps.spectro.urls` at the root, and wires the four Django error handlers (`handler400/403/404/500`) to `apps/spectro/modules/handlers.py`. A `503` has no Django-native handler slot, so it's exposed instead as an ordinary route (`views.maintenance_view`) for manual/manual-maintenance use.
- **`wsgi.py`/`asgi.py` are untouched boilerplate.** Both just set `DJANGO_SETTINGS_MODULE` and call Django's own application factory — kept as separate files (rather than picking only one) so the project can be served by either a WSGI server (gunicorn) or an ASGI one (uvicorn/daphne) without code changes.

## Links to other folders

- `apps/spectro/` — `settings.py` supplies `AUTH_USER_MODEL = "spectro.User"` (resolved via `apps/spectro/models/auth_models.py`), `INSTALLED_APPS` registers `apps.spectro`, and `urls.py` includes `apps.spectro.urls`. `db_router.py`'s only awareness of `spectro` is the string label match described above.
- `templates/` — `TEMPLATES[0]["DIRS"]` points at `BASE_DIR / "templates"`; every `render()` call across the project resolves against this one setting.
- `static/` — `STATICFILES_DIRS`, `STATIC_ROOT`, and the Whitenoise `STORAGES["staticfiles"]["BACKEND"]` are all defined here; `apps/core` itself never serves a file, it only configures how Whitenoise (in `MIDDLEWARE`) does.
- `.env` / `.env.example` (repo root) — the entire contents of `settings.py` are effectively a typed projection of this file via `decouple.config()`.
- `manage.py` (repo root) — the only other file that references `apps.core` directly (`DJANGO_SETTINGS_MODULE=apps.core.settings`), making this app the mandatory entrypoint for every management command.
# apps/spectro/

Django app holding all of Spectro's actual product logic. `views.py` is an orchestrator ONLY — it imports functions from `modules/` and calls them. No business logic lives in `views.py` or `urls.py`.

## Tree

```
apps/spectro/
├── __init__.py
├── apps.py                   # AppConfig — label="spectro" (AUTH_USER_MODEL, db_table FKs use this label)
├── urls.py                   # all app routes, included from apps/core/urls.py
├── views.py                  # thin orchestrator — request in, module function out
├── models/
│   ├── __init__.py           # re-exports both files below so migrations see one unit
│   ├── auth_models.py        # User(AbstractUser) -> db_table "users"
│   └── spectro_models.py     # every other ERD table (Spectrometer, SpectroStandard,
│                             # LotSample, SpectroRawValues, SpectroDeltaValues,
│                             # SpectroJudgement, VisualJudgement, SpecialCase,
│                             # StdLimitChangelog, LotSamplesChangeLog, QcProgramRecord, ...)
└── modules/
    ├── __init__.py
    ├── handlers.py           # 400/403/404/500/503 error page renderers
    ├── authentication.py     # login/logout (render_login, do_logout)
    ├── samples_reader.py     # "Value Reader" wizard: connect/calibrate, save standard,
    │                         # save sample readings, product code search/save, check_lot_exists
    └── samples_record.py     # "Samples Record" page: table data, QC cross-check
                              # (_qc_lookup_for_row), visual/spectro judgement saves,
                              # special pass, Excel export (openpyxl)
```

## Why it's built this way

- **One function per unit of work.** Each page/feature gets its own module file in `modules/`. Adding a page = new module file + render function + import in `views.py` + route in `urls.py`. `views.py` never grows business logic — it stays a flat list of `def x_view(request): return x(request)`.
- **Models split by concern, not table count.** `models/` is a package. `auth_models.py` is isolated because `AUTH_USER_MODEL = "spectro.User"` needs to resolve before most other models exist. `spectro_models.py` holds the rest, mapped 1:1 from the ERD screenshot. `models/__init__.py` re-exports both so `makemigrations`/`migrate` treat them as one app.
- **`QcProgramRecord` is `managed=False`.** It's a view (`view_spectro`) owned by an external QC program's database, not this project — Django never migrates it, and `apps/core/db_router.py`'s `QcProgramRouter` routes it to the `server` DB alias instead of `default`.
- **Hardware logic is deliberately absent.** BLE/SDK/calibration code lives in a separate local agent (compiled independently, runs as a Windows Service). `samples_reader.py` only ever receives finished measurement JSON from the browser — the browser talks to the agent directly over HTTP, not this Django app.

## Links to other folders

- `apps/core/` — supplies `settings.py` (`AUTH_USER_MODEL`, `DATABASES`, `DATABASE_ROUTERS`), root `urls.py` (includes `apps.spectro.urls`), and the WSGI/ASGI entrypoints. `apps/core/db_router.py` only affects `QcProgramRecord` from this app.
- `templates/` — every `render()` call in `modules/*.py` points at a path under `templates/pages/` or `templates/handlers/`. Views pass context dicts (URLs via `reverse()`, JSON-serializable flags) that the templates read via `{% url %}` and inline `<script>` blocks.
- `static/` — modules that render pages (`samples_reader_view`, `samples_record_view`, login) don't touch `static/` directly, but the templates they render load `static/js/shared/pages/*.js`, which then call back into this app's JSON endpoints (`api_save_*`, `api_*`) defined in `urls.py`.
- Endpoints under `modules/samples_reader.py` and `modules/samples_record.py` are consumed exclusively by `static/js/shared/pages/samples_reader.js` and `samples_record.js` respectively — the URL names in `urls.py` and the `window.SAMPLES_*_URLS` objects in the matching `.django` templates are the contract between them.
<div align="center">

  # <img src="./static/img/spectro.png" alt="Header" width="400">

  A web-based color measurement system built for Masterbatch Philippines Inc., replacing manual, spreadsheet-based color quality checks with a digital workflow connected directly to spectrophotometer hardware. Lab technicians connect a spectrometer, calibrate it, and read color measurements from production samples straight from their browser, each sample is automatically compared against its approved color standard to determine a pass/fail result, with every reading, standard, and judgement stored centrally for the Laboratory Department to review.

  <p>
    <img src="https://img.shields.io/badge/pnpm-10.0-4a4a4a?style=flat-square&logo=pnpm&logoColor=f69220" alt="pnpm version" />
    <img src="https://img.shields.io/badge/django-%5E5.0-blue?style=flat-square&logo=django&logoColor=05130d" alt="django version" />
    <img src="https://img.shields.io/badge/tailwind--css-%5E4.3-blue?style=flat-square&logo=tailwind-css&logoColor=38bdf8" alt="tailwind-css version" />
    <img src="https://img.shields.io/badge/psycopg2--binary-%5E2.9-blue?style=flat-square" alt="psygopg2-binary version" />
    <img src="https://img.shields.io/badge/python--decouple-%5E3.8-blue?style=flat-square" alt="python-decouple version" />
    <img src="https://img.shields.io/badge/whitenoise-%5E6.6-blue?style=flat-square" alt="whitenoise version" />
  </p>

</div>

<br>

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [Project Structure](#3-project-structure)
4. [Dev Setup](#4-dev-setup)
5. [Deployment](#5-deployment)
6. [Key Concepts](#6-key-concepts)
7. [Models Overview](#7-models-overview)

<br>

## 1. Project Overview

**Project Initiation**
- Date: August 01, 2026

**Who is it for?**
- Lab Dept. calibrate the spectrometer and read color samples, review standards, judgements, and remarks.

**What does it do?**
- Connects to a spectrometer over BLE via a separate local hardware agent, keeping all hardware/SDK logic outside the Django project
- Reads and records color measurements (L\*, a\*, b\*, C\*, h°) for production samples against a chosen standard
- Automatically calculates ΔE\*00 and the individual ΔL\*/ΔC\*/ΔH\*/Δa\*/Δb\* deltas per sample
- Automatically judges each sample as Passed or Failed by comparing its ΔE\*00 against the currently active Standard ΔE Used value
- Lets an authorized user edit the Standard ΔE Used value in place, with validation and a confirmation step before saving, and keeps a full change history of every adjustment
- Supports Visual Judgement (Passed/Failed) and free-text remarks per sample, saved independently of the automatic spectro judgement
- Plots sample results on a Δa\*/Δb\* scatter graph, color-coded by pass/fail
- Requires sign-in for every page; nothing is viewable without an authenticated session

**Tech Stack**
- Backend: Django
- Frontend: JavaScript, Tailwind
- Database: PostgreSQL
- Hardware bridge: separate local server Flask-based executable (compiled independently via separate repo: Spectro-LSE), talking to the vendor spectrometer SDK over ctypes

<br>

## 2. Features

### Authentication
- Sign-in required for every page: unauthenticated visitors are redirected to the login page automatically
- Successful login redirects straight to the Samples Record page
- Logout fully clears the session

### Samples Record Page
- **Product Code**: type-to-search field; narrows a live list of existing product codes as the user types, shows a "try a different keyword" message when nothing matches, and clears any previously selected code the moment the user starts typing something new
- **Standard Sample**: dependent dropdown, populated only after a Product Code is chosen
- **Standard ΔE Used**: editable in place:
  - Accepts numeric input only, masked to two decimal places
  - Empty input is rejected with an error message and reverts to the last known value
  - A lower value than the current one is rejected with an error message and reverts
  - A higher value triggers a confirmation popup before saving
  - On confirmation, the new value is saved and the previous value is written to a change history table along with which user made the change
  - Editing this value immediately recalculates every visible sample's pass/fail result without a page reload
- **Samples table**: combines data from six related tables (sample record, raw readings, calculated deltas, spectro judgement, visual judgement, special-pass record) into one row per sample:
  - Color Simulation column shows a color swatch alongside its stored value
  - Visual Judgement is an editable dropdown (Passed/Failed), saving immediately and recording who judged it
  - Reason for Fail and Spectro Remarks are click-to-edit text cells, saving automatically on Enter or on click-away
  - Special Pass and Special Pass By are editable: ticking Special Pass unlocks a Special Pass By dropdown, saving immediately and recording who overrode it (with change history)
  - Final QC Evaluation column cross-checks each sample's lot/bag against the external QC program's own records, with a status icon/tooltip per row
  - Supports column sorting, freeze-column pinning, and live search filtering (including `@column: keyword` targeted search)
- **Generate Report**: exports the current product code/standard's samples to a formatted Excel file (openpyxl), with conditional pass/fail coloring
- **Re-Read Selected Samples**: select existing samples and carry them into the Samples Reader wizard to re-measure and update their readings in place, with a full audit trail of the old values
- **Δa\*/Δb\* scatter graph**: plots every sample in the current table, color-coded to match the table's pass/fail judgement, with a maximizable popup view

### Samples Reader (Value Reader) Page
- 3-step wizard: **Setup the Instrument** → **Choose Product Code** → **Read the Sample**
- **Step 1 — Instrument**: connect to the spectrometer over BLE via the local agent, then calibrate black and white references before continuing; connection/calibration state persists across page navigation until disconnected
- **Step 2 — Product Code & Standard**: type-ahead product code search/create, then either register a New Standard + Sample (captures a fresh reference reading) or use an Existing Standard already on record
- **Step 3 — Samples**: Read Light / Read Dark reference rows (new-standard flow) and Read Sample for production samples, each auto-computing ΔE\*00 and pass/fail against the active Standard ΔE Used
  - Visual Judgement (Pass/Fail/None) and Special Pass (with Special Pass By) are set per sample here too, and are mandatory before saving
  - Lot Number and Visual Judgement are required per row; Special Pass, Bag, and Remarks are optional
  - During a Re-Read session, Visual Judgement/Special Pass/Remarks stay locked per row until that row is actually re-measured
- A dev-only instrument mode (`DJANGO_DEV_INSTRUMENT_SOURCE`) returns fake-but-plausible readings so the wizard can be developed without physical hardware attached

### Authentication (cont'd)
- Forgot Password flow: request a reset email, follow the link, set a new password (Django's built-in `auth_views`)

### Shared UI
- Toast notifications with four tones (info, success, warning, danger)
- Reusable form shell that submits without a page reload and shows a toast based on the server's response
- Reusable button, dropdown, input, data table, scatter graph, and modal/popup components, each built once and reused across pages with different parameters
- Sidebar and header automatically highlight/update based on which page is currently open
- Dark mode toggle, remembered across page navigation
- Shared error/maintenance page (400/403/404/500/503) with a "take me back" button

---

## 3. Project Structure

```
spectro/
├── manage.py
├── package.json
├── pnpm-lock.yaml
├── requirements.txt
├── .gitignore
├── .env.example
├── .env                            # local environment variables (gitignored)
│
├── apps/
│   ├── core/                       # App 1 — project-wide config
│   │   ├── settings.py
│   │   ├── urls.py                 # root urls, includes apps.spectro.urls
│   │   ├── wsgi.py
│   │   ├── db_router.py            # Bridge between Spectro and QC program tables
│   │   └── asgi.py
│   │
│   └── spectro/                    # App 2 — the actual product
│       ├── apps.py                 # AppConfig, label="spectro"
│       ├── urls.py
│       ├── views.py                # ORCHESTRATOR ONLY — no business logic
│       ├── models/
│       │   ├── __init__.py         # re-exports both model files for migrations
│       │   ├── auth_models.py      # User(AbstractUser) → AUTH_USER_MODEL
│       │   └── spectro_models.py   # every other ERD table
│       └── modules/                # one file per page/unit of work
│           ├── authentication.py
│           ├── handlers.py
│           ├── samples_reader.py
│           └── samples_record.py
│
├── templates/
│   ├── base.django                 # shared page shell
│   ├── components/
│   │   └── shared/
│   │       ├── global/             # site-wide structural pieces (sidebar, header, footer, modals, cards)
│   │       └── ui/                 # reusable, parameterized UI components (table, dropdown, forms, etc.)
│   ├── handlers/
│   │       └── status.django       # shared 400/403/404/500/503 error page
│   ├── auth/
│   │   └── login.django
│   └── pages/
│       ├── samples_reader.django
│       └── samples_record.django
│
└── static/
    ├── css/
    │   └── output.css              # single source-of-truth stylesheet
    └── js/
        ├── base.js                 # dynamic script loader
        └── shared/
            ├── app.js              # orchestrator: calls every component's init function
            ├── global/             # JS behind the global/ templates
            ├── ui/                 # JS behind the ui/ components
            ├── pages/              # one file per page (samples_reader.js, samples_record.js)
            └── utils/              # csrf.js, instrument_env.js, instrument_dev.js (agent bridge)
```

<br>

## 4. Dev Setup

### Requirements
- Python 3.12+
- Node.js (v24+ recommended) & pnpm
- PostgreSQL 16+ (running instance, credentials you control)
- uv
- see other libraries at `requirements.txt` file

### Install dependencies

#### a. Install `uv` package manager for python. See [astral guides](https://docs.astral.sh/uv/getting-started/installation/) for installation setup

> [!Note] 
> Installation of `uv` is one time only.

#### b. Verify `uv` installation
```bash
uv --version
```
#### c. Install the virtual environment
```bash
uv venv
```
#### d. Activate the virtual environment

```bash
.venv\Scripts\activate    
```
#### e. Start installing dependecies
```bash
uv pip install -r requirements.txt
```

#### f. Install pnpm (if not already installed, make sure node.js is also installed):
```bash
npm install -g pnpm
```
```bash
pnpm install
```

### Step 2: Configure environment variables

`DJANGO_DEV_INSTRUMENT_SOURCE` toggles the Samples Reader's spectrometer source: `True` uses fake-but-plausible readings (no hardware/dongle needed), `False` talks to the real local agent. No code edit needed to switch — just update `.env` and reload.

#### a. Copy `.env.example` to `.env`, run terminal in same directory and run:
```bash
copy .env.example .env
```

#### b. Open text editor to edit the `.env` credentials
```bash
notepad .env
```

#### c. Fill in the values in `.env` first before generating a secret key for `DJANGO_SECRET_KEY` variable. 
#### e. Command to generate a secret key with:
```python
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

> [!Important]
> For a production/deployment environment, 
> set `DJANGO_DEBUG` to `False` and list the actual server hostname(s)/IP(s) in `DJANGO_ALLOWED_HOSTS` instead of using `*`.
> e.g. `DJANGO_ALLOWED_HOSTS=127.0.0.1,192.168.1.1`

### Step 3: Run migrations
```bash
python manage.py makemigrations spectro
```
```bash
python manage.py migrate
```

### Step 4: Create an admin/login user
```bash
python manage.py createsuperuser
```

### Step 6: Run the development environment
To run the project locally, open two terminal windows in the project root:

**Terminal 1: Tailwind CSS Compiler (Watcher)**
```bash
pnpm run dev:css
```
**Terminal 2: Where Django (.venv) is active**
```bash
python manage.py runserver
```
Visit `http://127.0.0.1:8000/` and it lands on the login page.

### Step 7: If development is done, run command to compile final stylesheet
**Terminal 1: Tailwind CSS**
```bash
pnpm run build:css
```

<br>

## 5. Deployment

### Execute following commands

```bash
git clone https://github.com/Masterbatch-Philippines-Inc/Spectro.git
```

#### or if there is existing deployment:

```bash
git pull
```

#### then:

```bash
cd /d <path/to/repo>
```
```bash
uv venv
```
```bash
uv pip install -r requirements.txt
```
```bash
copy .env.example .env
```
```bash
notepad .env
```
> Note: Edit the environment variables first before proceeding on next command.
```python
python manage.py makemigrations spectro
```
```python
python manage.py migrate
```
```python
python manage.py collectstatic --noinput --ignore=input.css --ignore=design-tokens.css
```
> [!Tip]
> This compiles the latest Tailwind output and delivers it through `output.css` — skipping it means the server keeps serving stale static files even after a successful deploy.

> [!Warning]
> - Don't change defined values of `env.example` variables.
> - Edit `.env` file and save.
> - Ask the dev for other missing required values.

<br>

## 6. Key Concepts

**`views.py` is an orchestrator only.** It imports render functions from `apps/spectro/modules/*` and calls them — it never contains business logic itself. Each page or unit of work gets its own module file. To add a new page: create a new file in `modules/`, add a render function, import it in `views.py`, and wire a URL in `apps/spectro/urls.py`.

**Custom user model.** `AUTH_USER_MODEL = "spectro.User"`. `User` subclasses Django's `AbstractUser`, mapped to `db_table = "users"`.

**Models are split by concern, not by table count.** `apps/spectro/models/` is a package, not a single file. `auth_models.py` holds `User`; `spectro_models.py` holds every other table from the ERD. `models/__init__.py` re-exports both so Django's migration system treats them as one unit.

**`QcProgramRecord` is `managed=False`.** This table belongs to an external QC program's database, not this project. Django will never create, alter, or drop it via migrations — only read/write rows assumed to already exist. If this table genuinely lives on a separate physical database (not just a separate table in the same database), a database router will additionally be needed.

**Hardware/instrument code is intentionally absent from this project.** SDK bindings, BLE connection handling, calibration, and measurement logic all live in a separate local agent (compiled independently, runs as a Windows Service on each lab PC). This Django project never talks to the hardware directly — the browser communicates with the local agent over HTTP for anything hardware-related. Django only ever receives finished measurement results to store.

**Static assets load through a single orchestrator.** `base.js` dynamically loads every shared script and waits for all of them before calling `initApp()` in `app.js`, which is the single place every component's startup behavior is registered.

**Templates follow a shared-shell + component-library pattern.** `base.django` includes the sidebar, header, footer, toast container, and modal container automatically. Reusable pieces live under `templates/components/shared/`, split into `global/` (structural, once-per-page pieces) and `ui/` (smaller, reusable, parameterized building blocks).

**Multi-database routing.** `settings.DATABASES` defines two aliases, default and server. apps/core/db_router.py's QcProgramRouter routes only QcProgramRecord reads/writes to server — every other model stays on default.

**The local agent is called through one choke point.** static/js/shared/utils/instrument_dev.js is the only file that talks to the local hardware agent `(localhost:5151)` or returns DEV-mode fake data -> samples_reader.js never calls the agent directly.

<br>

## 7. Models Overview

| Model | File | Description |
|---|---|---|
| `User` | `auth_models.py` | Custom user model, extends Django's `AbstractUser`, mapped to `db_table = "users"` |
| `QcProgramRecord` | `spectro_models.py` | Unmanaged, read-only view (`view_spectro`) on the external QC program's own database (routed via `QcProgramRouter`) |
| `Spectrometer` | `spectro_models.py` | A physical spectrometer device record (serial number, model) |
| `SpectrometerRecord` | `spectro_models.py` | Per-product-code record; holds the active `std_delta_e_used` tolerance value, baked into each batch at save time so future limit changes never affect prior batches |
| `SpectroStandard` | `spectro_models.py` | A saved color standard (with raw L\*/a\*/b\*/C\*/h°) tied to a `SpectrometerRecord`; only one standard per record is ever `is_active_standard=True` |
| `StdLimitChangelog` | `spectro_models.py` | Change history for `std_delta_e_used` — old value, who changed it, when |
| `LotSample` | `spectro_models.py` | A single measured production sample (or LT/DR reference reading), tied to a `SpectroStandard` |
| `SpectroRawValues` | `spectro_models.py` | Raw L\*/a\*/b\*/C\*/h° readings for a `LotSample` |
| `SpectroDeltaValues` | `spectro_models.py` | Calculated ΔE\*00/ΔL\*/ΔC\*/ΔH\*/Δa\*/Δb\* for a set of raw values |
| `VisualJudgement` | `spectro_models.py` | Manual pass/fail judgement and fail reason for a `LotSample` |
| `SpectroJudgement` | `spectro_models.py` | Automatic pass/fail judgement, color offset, and remarks for a `LotSample` against a `SpectroStandard`; stamps the `std_de_used` this row was evaluated against (never retroactively changed) |
| `SpectroJudgementChangelog` | `spectro_models.py` | Change history for spectro judgement remarks |
| `SpecialCase` | `spectro_models.py` | Special-pass override record for a `LotSample` |
| `SpecialCaseChangelog` | `spectro_models.py` | Change history for special-pass decisions |
| `LotSamplesChangeLog` | `spectro_models.py` | Audit trail for the "Re-Read Selected Samples" workflow — snapshots a `LotSample`'s old raw/delta/judgement values before a re-read overwrites them in place |

<br>

## Built With

<p>
  <img src="https://img.shields.io/badge/Django-092E20?style=for-the-badge&logo=django&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
</p>

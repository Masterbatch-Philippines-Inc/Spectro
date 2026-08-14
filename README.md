# MBPI SPECTRO

A web-based color measurement system built for Masterbatch Philippines Inc., replacing manual, spreadsheet-based color quality checks with a digital workflow connected directly to spectrophotometer hardware. Lab technicians connect a spectrometer, calibrate it, and read color measurements from production samples straight from their browser — each sample is automatically compared against its approved color standard to determine a pass/fail result, with every reading, standard, and judgement stored centrally for the QC team to review.

This is an internal-only project.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [Project Structure](#3-project-structure)
4. [Setup and Installation](#4-setup-and-installation)
5. [Key Concepts](#5-key-concepts)
6. [Models Overview](#6-models-overview)

---

## 1. Project Overview

**Project Initiation**
- Date: August 01, 2026

**Who is it for?**
- Lab technicians who calibrate the spectrometer and read color samples
- QC staff who review standards, judgements, and remarks
- Admin users who manage standard ΔE tolerance limits and change history

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
- Backend: Python, Django
- Frontend: HTML, JavaScript, Tailwind CSS
- Database: PostgreSQL
- Environment config: python-decouple
- Hardware bridge: separate local Flask-based agent (compiled independently, Spectro Agent), talking to the vendor spectrometer SDK over ctypes

---

## 2. Features

### Authentication
- Sign-in required for every page — unauthenticated visitors are redirected to the login page automatically
- Successful login redirects straight to the Samples Record page
- Logout fully clears the session

### Samples Record Page
- **Product Code** — type-to-search field; narrows a live list of existing product codes as the user types, shows a "try a different keyword" message when nothing matches, and clears any previously selected code the moment the user starts typing something new
- **Standard Sample** — dependent dropdown, populated only after a Product Code is chosen
- **Standard ΔE Used** — editable in place:
  - Accepts numeric input only, masked to two decimal places
  - Empty input is rejected with an error message and reverts to the last known value
  - A lower value than the current one is rejected with an error message and reverts
  - A higher value triggers a confirmation popup before saving
  - On confirmation, the new value is saved and the previous value is written to a change history table along with which user made the change
  - Editing this value immediately recalculates every visible sample's pass/fail result without a page reload
- **Samples table** — combines data from six related tables (sample record, raw readings, calculated deltas, spectro judgement, visual judgement, special-pass record) into one row per sample:
  - Color Simulation column shows a color swatch alongside its stored value
  - Visual Judgement is an editable dropdown (Passed/Failed), saving immediately and recording who judged it
  - Reason for Fail and Spectro Remarks are click-to-edit text cells, saving automatically on Enter or on click-away
  - Special Pass and Special Pass By are visible but intentionally locked from editing for now
  - Supports column sorting, freeze-column pinning, and live search filtering
- **Δa\*/Δb\* scatter graph** — plots every sample in the current table, color-coded to match the table's pass/fail judgement, with a maximizable popup view

### Shared UI
- Toast notifications with four tones (info, success, warning, danger)
- Reusable form shell that submits without a page reload and shows a toast based on the server's response
- Reusable button, dropdown, input, data table, scatter graph, and modal/popup components, each built once and reused across pages with different parameters
- Sidebar and header automatically highlight/update based on which page is currently open
- Dark mode toggle, remembered across page navigation

---

## 3. Project Structure

```
mbpi_spectro/
├── manage.py
├── requirements.txt
├── .env                            # local environment variables (gitignored)
│
├── apps/
│   ├── core/                       # App 1 — project-wide config
│   │   ├── settings.py
│   │   ├── urls.py                 # root urls, includes apps.spectro.urls
│   │   ├── wsgi.py
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
│           ├── auth/
│           │   └── login.py
│           ├── samples_reader.py
│           └── samples_record.py
│
├── templates/
│   ├── base.html                   # shared page shell
│   ├── components/
│   │   └── shared/
│   │       ├── global/             # site-wide structural pieces (sidebar, header, footer, modals, cards)
│   │       └── ui/                 # reusable, parameterized UI components (table, dropdown, forms, etc.)
│   ├── auth/
│   │   └── login.html
│   └── pages/
│       ├── samples_reader.html
│       └── samples_record.html
│
└── static/
    ├── css/
    │   └── output.css              # single source-of-truth stylesheet
    └── js/
        ├── base.js                 # dynamic script loader
        └── shared/
            ├── app.js               # orchestrator: calls every component's init function
            ├── global/               # JS behind the global/ templates
            └── ui/                   # JS behind the ui/ components
```

---

## 4. Setup and Installation

### Requirements
- Python 3.11+
- PostgreSQL (running instance, credentials you control)
- pip
- see other libraries at `requirements.txt` file

### Step 1 — Install dependencies
```bash
python -m venv venv
venv/bin/activate    # macOS & Linux: source venv\Scripts\activate
pip install -r requirements.txt
```

### Step 2 — Configure environment variables
Create a `.env` file at the project root (same level as `manage.py`). This file is gitignored and never committed.

```
DJANGO_SECRET_KEY=your-real-secret-key-here
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=
```

Generate a real secret key with:
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

For a production/deployment environment, set `DJANGO_DEBUG=False` and list the actual server hostname(s)/IP(s) in `DJANGO_ALLOWED_HOSTS` instead of using a wildcard.

### Step 3 — Configure the database
Edit `apps/core/settings.py` → create variables in you env file → `DATABASES["default"]`:
```python
from decouple import config

DATABASES = {
    "default": {
        'ENGINE':   'django.db.backends.postgresql',
        'NAME':     config('DB_NAME'),
        'USER':     config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST':     config('DB_HOST'),
        'PORT':     config('DB_PORT'),
    }
}
```
Create the database first (e.g. `createdb mbpi_spectro_db` or via pgAdmin).

### Step 4 — Run migrations
```bash
python manage.py makemigrations spectro
python manage.py migrate
```

### Step 5 — Create an admin/login user
```bash
python manage.py createsuperuser
```

### Step 6 — Run the dev server
```bash
python manage.py runserver
```
Visit `http://127.0.0.1:8000/` → lands on the login page.

---

## 5. Key Concepts

**`views.py` is an orchestrator only.** It imports render functions from `apps/spectro/modules/*` and calls them — it never contains business logic itself. Each page or unit of work gets its own module file. To add a new page: create a new file in `modules/`, add a render function, import it in `views.py`, and wire a URL in `apps/spectro/urls.py`.

**Custom user model.** `AUTH_USER_MODEL = "spectro.User"`. `User` subclasses Django's `AbstractUser`, mapped to `db_table = "users"`.

**Models are split by concern, not by table count.** `apps/spectro/models/` is a package, not a single file. `auth_models.py` holds `User`; `spectro_models.py` holds every other table from the ERD. `models/__init__.py` re-exports both so Django's migration system treats them as one unit.

**`QcProgramRecord` is `managed=False`.** This table belongs to an external QC program's database, not this project. Django will never create, alter, or drop it via migrations — only read/write rows assumed to already exist. If this table genuinely lives on a separate physical database (not just a separate table in the same database), a database router will additionally be needed.

**Hardware/instrument code is intentionally absent from this project.** SDK bindings, BLE connection handling, calibration, and measurement logic all live in a separate local agent (compiled independently, runs as a Windows Service on each lab PC). This Django project never talks to the hardware directly — the browser communicates with the local agent over HTTP for anything hardware-related. Django only ever receives finished measurement results to store.

**Static assets load through a single orchestrator.** `base.js` dynamically loads every shared script and waits for all of them before calling `initApp()` in `app.js`, which is the single place every component's startup behavior is registered.

**Templates follow a shared-shell + component-library pattern.** `base.html` includes the sidebar, header, footer, toast container, and modal container automatically. Reusable pieces live under `templates/components/shared/`, split into `global/` (structural, once-per-page pieces) and `ui/` (smaller, reusable, parameterized building blocks).

---

## 6. Models Overview

| Model | File | Description |
|---|---|---|
| `User` | `auth_models.py` | Custom user model, extends Django's `AbstractUser`, mapped to `db_table = "users"` |
| `Spectrometer` | `spectro_models.py` | A physical spectrometer device record (serial number, model) |
| `SpectrometerRecord` | `spectro_models.py` | Per-product-code record, holds the active `std_delta_e_used` tolerance value |
| `SpectroStandard` | `spectro_models.py` | A saved color standard tied to a `SpectrometerRecord` |
| `StdLimitChangelog` | `spectro_models.py` | Change history for `std_delta_e_used` — old value, who changed it, when |
| `LotSample` | `spectro_models.py` | A single measured production sample, tied to a `SpectroStandard` |
| `SpectroRawValues` | `spectro_models.py` | Raw L\*/a\*/b\*/C\*/h° readings for a `LotSample` |
| `SpectroDeltaValues` | `spectro_models.py` | Calculated ΔE\*00/ΔL\*/ΔC\*/ΔH\*/Δa\*/Δb\* for a set of raw values |
| `VisualJudgement` | `spectro_models.py` | Manual pass/fail judgement and remarks for a `LotSample` |
| `SpectroJudgement` | `spectro_models.py` | Automatic pass/fail judgement, color offset, and remarks for a `LotSample` against a `SpectroStandard` |
| `SpectroJudgementChangelog` | `spectro_models.py` | Change history for spectro judgement remarks |
| `SpecialCase` | `spectro_models.py` | Special-pass override record for a `LotSample` |
| `SpecialCaseChangelog` | `spectro_models.py` | Change history for special-pass decisions |
| `QcProgramRecord` | `spectro_models.py` | Unmanaged — represents a table owned by an external QC program database |

---

## Built With

<p>
  <img src="https://img.shields.io/badge/Django-092E20?style=for-the-badge&logo=django&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
  <img src="https://img.shields.io/badge/python--decouple-3A3A3A?style=for-the-badge&logoColor=white" />
</p>

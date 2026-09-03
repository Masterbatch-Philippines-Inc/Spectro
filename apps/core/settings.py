"""
Django settings for MBPI SPECTRO project.
App 1: apps.core -> settings.py, root urls.py, wsgi.py, asgi.py
App 2: apps.spectro -> views (orchestrator), modules/, models/
"""

from pathlib import Path
from decouple import config, Csv

# BASE_DIR points to the project root (two levels up from this file:
# apps/core/settings.py -> apps/core -> apps -> project root)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config('DJANGO_SECRET_KEY')

DEBUG = config('DJANGO_DEV_DEBUG', default=False, cast=bool)

ALLOWED_HOSTS: list[str] = config('DJANGO_ALLOWED_HOSTS', cast=Csv()) # type: ignore

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "apps.spectro",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "apps.core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "apps.core.wsgi.application"
ASGI_APPLICATION = "apps.core.asgi.application"

# NOTE: point this at the actual Postgres instance used by the project.
DATABASES = {
    'default': {
        'ENGINE':   config('DB_ENGINE',     default='django.db.backends.postgresql'),
        'NAME':     config('DB_NAME',       default='db_spectro'),
        'USER':     config('DB_USER',       default='postgres'),
        'PASSWORD': config('DB_PASSWORD',   default='postgres'),
        'HOST':     config('DB_HOST',       default='localhost'),
        'PORT':     config('DB_PORT',       default='5432'),
    },
    'server': {
        'ENGINE':   config('SERVER_DB_ENGINE',      default='django.db.backends.postgresql'),
        'NAME':     config('SERVER_DB_NAME',        default='db_spectro'),
        'USER':     config('SERVER_DB_USER',        default='postgres'),
        'PASSWORD': config('SERVER_DB_PASSWORD',    default='postgres'),
        'HOST':     config('SERVER_DB_HOST',        default='localhost'),
        'PORT':     config('SERVER_DB_PORT',        default='5432'),
    }
}

DATABASE_ROUTERS = ["apps.core.db_router.QcProgramRouter"]

# Custom user model lives in apps/spectro/models/auth_models.py
AUTH_USER_MODEL = "spectro.User"

LOGIN_URL = "auth_login"
LOGIN_REDIRECT_URL = "samples_reader"
LOGOUT_REDIRECT_URL = "auth_login"

# --- EMAIL / PASSWORD RESET CONFIGURATION ---
EMAIL_BACKEND           = config('EMAIL_BACKEND',       default='django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST              = config('EMAIL_HOST',          default='smtp.gmail.com')
EMAIL_PORT              = config('EMAIL_PORT',          default=587, cast=int)
EMAIL_USE_TLS           = config('EMAIL_USE_TLS',       default=True, cast=bool)
EMAIL_HOST_USER         = config('EMAIL_HOST_USER',     default='mbpi.itsupport@gmail.com')
EMAIL_HOST_PASSWORD     = config('EMAIL_HOST_PASSWORD', default='secret')
DEFAULT_FROM_EMAIL      = config('DEFAULT_FROM_EMAIL',  default=EMAIL_HOST_USER)
PASSWORD_RESET_TIMEOUT  = 3600  # seconds -- reset link valid for 1 hour

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- TAILWIND V4 CONFIGURATION ---
TAILWIND_CLI_PATH = "npx"
TAILWIND_CLI_AUTOMATIC_DOWNLOAD = False
TAILWIND_CLI_SRC_CSS = "css/input.css"
TAILWIND_CLI_DIST_CSS = "css/output.css"
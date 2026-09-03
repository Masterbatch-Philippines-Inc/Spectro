"""
apps/spectro/modules/handlers.py

Renders templates/handlers/status.html for Django's error handlers
(400/403/404/500, wired in apps/core/urls.py). status.js reads the
status code off the page and fills in icon/headline/text + wires the
"back to last page" button.
"""

from django.shortcuts import render


def render_status(request, status_code, exception=None):
    return render(request, "handlers/status.html", {"status_code": status_code}, status=status_code)


def handler400(request, exception=None):
    return render_status(request, 400, exception)


def handler403(request, exception=None):
    return render_status(request, 403, exception)


def handler404(request, exception=None):
    return render_status(request, 404, exception)


def handler500(request):
    return render_status(request, 500)


def handler503(request):
    return render_status(request, 503)
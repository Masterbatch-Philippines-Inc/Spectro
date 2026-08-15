"""
apps/spectro/modules/auth/login.py

Module for the Login page. Called by apps/spectro/views.py -- kept
here as a plain function so views.py stays a thin orchestrator.
"""

from django.contrib.auth import authenticate, login, logout
from django.shortcuts import redirect, render


def render_login(request):
    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect("samples_record")
        return render(request, "pages/auth/login.html", {
            "error": "Invalid username or password."
        })

    return render(request, "pages/auth/login.html")


def do_logout(request):
    logout(request)
    return redirect("auth_login")
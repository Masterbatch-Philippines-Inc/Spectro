"""
apps/spectro/modules/auth/login.py

Module for the Login page. Called by apps/spectro/views.py -- kept
here as a plain function so views.py stays a thin orchestrator.
"""

from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.shortcuts import redirect, render


def render_login(request):
    if request.user.is_authenticated:
        return redirect("samples_record")

    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            messages.success(request, "Successfully logged in!")
            return redirect("samples_record")
        request.session["login_error"] = "Invalid username or password."
        return redirect("auth_login")

    error = request.session.pop("login_error", None)
    return render(request, "pages/auth/login.html", {"error": error})


def do_logout(request):
    logout(request)
    return redirect("auth_login")
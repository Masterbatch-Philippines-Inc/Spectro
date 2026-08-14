"""
apps/spectro/modules/samples_reader.py

Module for the "Value Reader" / new-samples wizard page.
"""

from django.shortcuts import render
from django.contrib.auth.decorators import login_required

@login_required
def render_samples_reader(request):
    return render(request, "pages/samples_reader.html")

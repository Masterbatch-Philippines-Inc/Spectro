"""
apps/spectro/modules/samples_reader.py

Module for the "Value Reader" / new-samples wizard page.
"""

from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse

from apps.spectro.models import Spectrometer

@login_required
def render_samples_reader(request):
    return render(request, "pages/samples_reader.html")


@login_required
def get_spectrometer_info(request):
    """
    Step 1 connect flow: after the local agent confirms a BLE connection,
    the wizard checks here for an existing Spectrometer row before falling
    back to whatever the agent itself reported.
    """
    record = Spectrometer.objects.order_by("-date_time").first()

    if not record:
        return JsonResponse({"found": False})

    return JsonResponse({
        "found": True,
        "device_model": record.device_model,
        "device_sn": record.device_sn,
    })

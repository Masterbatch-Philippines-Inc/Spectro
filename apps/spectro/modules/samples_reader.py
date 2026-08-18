"""
apps/spectro/modules/samples_reader.py

Module for the "Value Reader" / new-samples wizard page.
"""

import json
import re

from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse

from apps.spectro.models import Spectrometer, SpectrometerRecord, SpectroStandard

PRODUCT_CODE_RE = re.compile(r'^[A-Z]{2}\d{1,5}E(-I)?$')


@login_required
def save_product_code(request):
    """
    Checks server-side first: if the product code already exists, reuse it
    (no duplicate record created) and tell the client so via tone=info.
    Only creates a new SpectrometerRecord when the code is genuinely new.
    """
    if request.method != "POST":
        return JsonResponse({"tone": "danger", "message": "Invalid request method."}, status=405)

    code = request.POST.get("product_code", "").strip().upper()
    if not code:
        return JsonResponse({"tone": "danger", "message": "Product code is required."}, status=400)
    if not PRODUCT_CODE_RE.match(code):
        return JsonResponse({"tone": "danger", "message": "Invalid product code format."}, status=400)

    existing = SpectrometerRecord.objects.filter(product_code=code).first()
    if existing:
        return JsonResponse({
            "tone": "info",
            "message": "This product code already exists — using the existing record.",
            "product_code": code,
            "created": False,
        })

    SpectrometerRecord.objects.create(product_code=code)
    return JsonResponse({
        "tone": "success",
        "message": "Prod code saved",
        "product_code": code,
        "created": True,
    })


@login_required
def render_samples_reader(request):
    product_codes = (
        SpectrometerRecord.objects
        .order_by("product_code")
        .values_list("product_code", flat=True)
        .distinct()
    )
    context = {
        "product_code_options_json": json.dumps(list(product_codes)),
    }
    return render(request, "pages/samples_reader.html", context)


@login_required
def save_standard(request):
    """
    Saves a new SpectroStandard under the given product code's
    SpectrometerRecord.

    Rule: the newly saved standard is always is_active_standard=True.
    Any other standard already under that same record has its
    is_active_standard flipped to False -- there is only ever one
    active standard per product code at a time.
    """
    if request.method != "POST":
        return JsonResponse({"tone": "danger", "message": "Invalid request method."}, status=405)

    product_code = request.POST.get("product_code", "").strip().upper()
    standard_name = request.POST.get("standard_name", "").strip()
    std_delta_e = request.POST.get("std_delta_e", "").strip()

    if not product_code:
        return JsonResponse({"tone": "danger", "message": "Product code is required."}, status=400)
    if not standard_name:
        return JsonResponse({"tone": "danger", "message": "Standard name is required."}, status=400)

    record = SpectrometerRecord.objects.filter(product_code=product_code).first()
    if not record:
        return JsonResponse({"tone": "danger", "message": "Product code not found. Save it first."}, status=404)

    try:
        std_delta_e_value = float(std_delta_e) if std_delta_e else 1.00
    except ValueError:
        std_delta_e_value = 1.00

    # deactivate any existing standards under this same product code first
    SpectroStandard.objects.filter(record=record, is_active_standard=True).update(is_active_standard=False)

    new_standard = SpectroStandard.objects.create(
        standard_name=standard_name,
        record=record,
        is_active_standard=True,
    )

    if record.std_delta_e_used != std_delta_e_value:
        record.std_delta_e_used = std_delta_e_value
        record.save(update_fields=["std_delta_e_used"])

    return JsonResponse({
        "tone": "success",
        "message": "Standard saved.",
        "standards_id": new_standard.standards_id,
        "standard_name": new_standard.standard_name,
    })


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

"""
apps/spectro/modules/samples_reader.py

Module for the "Value Reader" / new-samples wizard page.
"""

import re, math, json

from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse

from apps.spectro.models import (
    Spectrometer,
    SpectrometerRecord,
    SpectroStandard,
    LotSample,
    SpectroRawValues,
    SpectroDeltaValues,
    SpectroJudgement,
)

# Accepts both the original XX00000E(-I)? shape and the newer
# XX-X00000E(-I)? shape (e.g. "DV-I16110E") -- the "-X" segment is an
# optional single-letter sub-prefix inserted right after the initial
# 2 letters. Must stay in sync with PRODUCT_CODE_RE in
# static/js/shared/pages/samples_reader.js.
PRODUCT_CODE_RE = re.compile(r'^[A-Z]{2}(-[A-Z])?\d{4,5}E(-I)?$')
LOT_NUMBER_RE   = re.compile(r'^(DR |LT )?\d{4}[A-Za-z]{1,2}$')

# Bag Number is restricted to a fixed set of shapes: 0, 00, 000, 0-0,
# 0-00, 00-00, 00-000, 000-000 -- anything else is rejected. Must stay
# in sync with BAG_NUMBER_RE in static/js/shared/pages/samples_reader.js.
BAG_NUMBER_RE = re.compile(r'^(\d{1,3}|\d{1}-\d{1}|\d{1}-\d{2}|\d{2}-\d{2}|\d{2}-\d{3}|\d{3}-\d{3})$')

@login_required
def save_product_code(request):
    """
    Checks server-side first: if the product code already exists, reuse it
    (no duplicate record created) and tell the client so via tone=info.
    Only creates a new SpectrometerRecord when the code is genuinely new.
    """
    if request.method != "POST":
        return JsonResponse({"tone": "error", "message": "Invalid request method."}, status=405)

    code = request.POST.get("product_code", "").strip().upper()
    if not code:
        return JsonResponse({"tone": "error", "message": "Product code is required."}, status=400)
    if not PRODUCT_CODE_RE.match(code):
        return JsonResponse({"tone": "error", "message": "Invalid product code format."}, status=400)

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
        "product_code_options": list(product_codes),
    }
    return render(request, "pages/samples_reader.html", context)


@login_required
def save_standard(request):
    """
    Saves a new SpectroStandard under the given product code's
    SpectrometerRecord. Called only at Step 3's "Finish Reading" --
    NOT at the moment the reference is captured -- so the standard row
    only exists once the whole session is actually complete.

    Rule: the newly saved standard is always is_active_standard=True.
    Any other standard already under that same record has its
    is_active_standard flipped to False -- there is only ever one
    active standard per product code at a time.

    Raw L/a/b/C/h values are REQUIRED on every new save -- none of them
    may be blank/missing. Existing rows created before these columns
    existed default to 0.00 at the DB level, but that default is never
    something this endpoint will itself write.
    """
    if request.method != "POST":
        return JsonResponse({"tone": "error", "message": "Invalid request method."}, status=405)

    product_code = request.POST.get("product_code", "").strip().upper()
    standard_name = request.POST.get("standard_name", "").strip()
    std_delta_e = request.POST.get("std_delta_e", "").strip()

    raw_fields = {}
    for key in ("raw_l", "raw_a", "raw_b", "raw_c", "raw_h"):
        raw_fields[key] = request.POST.get(key, "").strip()

    if not product_code:
        return JsonResponse({"tone": "error", "message": "Product code is required."}, status=400)
    if not standard_name:
        return JsonResponse({"tone": "error", "message": "Standard name is required."}, status=400)

    missing_raw = [key for key, val in raw_fields.items() if val == ""]
    if missing_raw:
        return JsonResponse({
            "tone": "error",
            "message": "Missing raw value(s): " + ", ".join(missing_raw),
        }, status=400)

    try:
        raw_values = {key: float(val) for key, val in raw_fields.items()}
    except ValueError:
        return JsonResponse({"tone": "error", "message": "Raw values must be valid numbers."}, status=400)

    record = SpectrometerRecord.objects.filter(product_code=product_code).first()
    if not record:
        return JsonResponse({"tone": "error", "message": "Product code not found. Save it first."}, status=404)

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
        raw_l=raw_values["raw_l"],
        raw_a=raw_values["raw_a"],
        raw_b=raw_values["raw_b"],
        raw_c=raw_values["raw_c"],
        raw_h=raw_values["raw_h"],
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
def save_spectrometer_info(request):
    """
    Step 1 connect flow (b): client sends whatever serial/model it
    resolved (from an existing DB row, or the agent's own /connect
    response if none existed). get_or_create() is the validation step --
    if a Spectrometer with this device_sn doesn't exist yet, it's
    created here and "OK" is returned so the client can toast
    "serial and model saved". If it already exists, "EXISTS" is
    returned so the client just proceeds without an extra toast.
    """
    if request.method != "POST":
        return JsonResponse({"tone": "danger", "message": "Invalid request method."}, status=405)

    device_sn = request.POST.get("device_sn", "").strip()
    device_model = request.POST.get("device_model", "").strip()

    if not device_sn or not device_model:
        return JsonResponse({"tone": "danger", "message": "Serial number and model are required.", "status": "ERROR"}, status=400)

    record, created = Spectrometer.objects.get_or_create(
        device_sn=device_sn,
        defaults={"device_model": device_model},
    )

    if created:
        return JsonResponse({
            "tone": "success",
            "message": "Serial and model saved.",
            "status": "OK",
        })

    if record.device_model != device_model:
        record.device_model = device_model
        record.save(update_fields=["device_model"])
        return JsonResponse({
            "tone": "info",
            "message": "Spectrometer already on record — model updated.",
            "status": "UPDATED",
            "device_model": record.device_model,
            "device_sn": record.device_sn,
        })

    return JsonResponse({
        "tone": "info",
        "message": "Spectrometer already on record.",
        "status": "EXISTS",
        "device_model": record.device_model,
        "device_sn": record.device_sn,
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


def _validate_sample_payload_row(index, row):
    """
    Structural + format validation for a single row of the samples
    payload. Returns an error message string, or None if the row is fine.
    """
    name = (row.get("name") or "").strip()
    kind = (row.get("kind") or "").strip()

    if not name:
        return f"Row {index + 1}: lot number is required."
    if not LOT_NUMBER_RE.match(name):
        return f'Row {index + 1} ("{name}"): invalid lot number format.'
    if kind not in ("light", "dark", "sample"):
        return f'Row {index + 1} ("{name}"): unrecognized reading type.'
    if kind == "light" and not name.upper().startswith("LT "):
        return f'Row {index + 1} ("{name}"): light readings must keep the "LT " prefix.'
    if kind == "dark" and not name.upper().startswith("DR "):
        return f'Row {index + 1} ("{name}"): dark readings must keep the "DR " prefix.'

    required_numeric = ("de", "L", "C", "h", "a", "b", "dL", "dC", "dH", "da", "db")
    for key in required_numeric:
        val = row.get(key)
        if val is None:
            return f'Row {index + 1} ("{name}"): missing "{key}" value.'
        try:
            float(val)
        except (TypeError, ValueError):
            return f'Row {index + 1} ("{name}"): "{key}" must be a valid number.'

    color_simulation = (row.get("colorSimulation") or "").strip()
    if not color_simulation:
        return f'Row {index + 1} ("{name}"): missing color simulation value.'

    bag = (row.get("bag") or "").strip()
    if bag and not BAG_NUMBER_RE.match(bag):
        return f'Row {index + 1} ("{name}"): invalid bag number format — "{bag}".'

    return None


@login_required
def check_lot_exists(request):
    """
    Task 1.3: live check while the user is typing a lot number / bag in
    the Step 3 table -- confirms whether this lot (+ bag, if given)
    already exists in the DB under the given standard. Mirrors the same
    lot+bag matching rule used at final save time in save_sample_readings,
    just queried earlier/interactively instead of only at submit.
    """
    standards_id = request.GET.get("standards_id", "").strip()
    name = request.GET.get("name", "").strip()
    bag = request.GET.get("bag", "").strip()

    if not standards_id or not name:
        return JsonResponse({"exists": False})

    if not SpectroStandard.objects.filter(pk=standards_id).exists():
        return JsonResponse({"exists": False})

    bag_filter = Q(bag=bag) if bag else (Q(bag__isnull=True) | Q(bag=""))
    exists = LotSample.objects.filter(Q(standard_id=standards_id, sample_name=name) & bag_filter).exists()

    return JsonResponse({
        "exists": exists,
        "message": f'Lot number "{name}" is already saved under this standard.' if exists else "",
    })


@login_required
def save_sample_readings(request):
    """
    Step 3 "Finish Reading" -- persists every captured row in one atomic
    batch. Called once per session, after the standard itself already
    exists (either freshly saved via save_standard, or pre-existing via
    the "Use Existing Standard" flow).

    Each row becomes exactly one LotSample + one SpectroRawValues + one
    SpectroDeltaValues + one SpectroJudgement, matching the ERD 1:1:1:1
    chain for a single reading.

    Body: {
        "standards_id": <int>,
        "rows": [
            {
                "name": "1234AB" | "LT 1234AB" | "DR 1234AB",
                "kind": "light" | "dark" | "sample",
                "colorSimulation": "#FFFAFBF7",
                "colorOffset": "None" | "Light+" | "Dark+",
                "remarks": "",
                "de": 1.5, "L": 89.37, "C": 4.28, "h": 23.10, "a": 3.94, "b": 1.68,
                "dL": 0.20, "dC": 0.08, "dH": -0.06, "da": 0.01, "db": -0.08
            },
            ...
        ]
    }
    """
    if request.method != "POST":
        return JsonResponse({"tone": "danger", "message": "Invalid request method."}, status=405)

    standards_id = request.POST.get("standards_id", "").strip()
    rows_raw = request.POST.get("rows", "")

    if not standards_id:
        return JsonResponse({"tone": "danger", "message": "standards_id is required."}, status=400)

    standard = SpectroStandard.objects.filter(pk=standards_id).select_related("record").first()
    if not standard:
        return JsonResponse({"tone": "danger", "message": "Standard not found."}, status=404)

    try:
        rows = json.loads(rows_raw)
    except (TypeError, ValueError):
        return JsonResponse({"tone": "danger", "message": "Malformed sample data."}, status=400)

    if not isinstance(rows, list) or not rows:
        return JsonResponse({"tone": "danger", "message": "No sample readings were provided."}, status=400)

    # ---- structural / format validation, row by row ----
    for idx, row in enumerate(rows):
        error = _validate_sample_payload_row(idx, row)
        if error:
            return JsonResponse({"tone": "danger", "message": error}, status=400)

    # ---- duplicate checks ----
    # Uniqueness is lot + bag, not lot alone -- a repeated lot number is
    # only a problem when it ALSO shares the same bag (or both are
    # blank). A bag is only REQUIRED once its lot number repeats within
    # this session.
    name_counts = {}
    for row in rows:
        key = row["name"].strip().upper()
        name_counts[key] = name_counts.get(key, 0) + 1

    seen_pairs = set()
    for row in rows:
        name = row["name"].strip()
        bag = (row.get("bag") or "").strip()
        name_key = name.upper()

        if name_counts[name_key] > 1 and not bag:
            return JsonResponse({
                "tone": "danger",
                "message": f'Lot number "{name}" appears more than once — a Bag Number is required to distinguish each one.',
            }, status=400)

        pair_key = (name_key, bag.upper())
        if pair_key in seen_pairs:
            return JsonResponse({
                "tone": "danger",
                "message": f'Duplicate lot number "{name}"' + (f' with bag "{bag}"' if bag else '') + ' found within this session\'s readings.',
            }, status=400)
        seen_pairs.add(pair_key)

    existing_conflict = None
    for row in rows:
        name = row["name"].strip()
        bag = (row.get("bag") or "").strip()
        bag_filter = Q(bag=bag) if bag else (Q(bag__isnull=True) | Q(bag=""))
        if LotSample.objects.filter(Q(standard=standard, sample_name=name) & bag_filter).exists():
            existing_conflict = name
            break
    if existing_conflict:
        return JsonResponse({
            "tone": "danger",
            "message": f'Lot number "{existing_conflict}" already exists in the database for this standard.',
        }, status=400)

    threshold = float(standard.record.std_delta_e_used) if standard.record.std_delta_e_used is not None else 1.00

    # ---- persist atomically -- either every row saves, or none do ----
    try:
        with transaction.atomic():
            saved_ids = []
            for row in rows:
                name = row["name"].strip()
                kind = row["kind"].strip()

                lot_sample = LotSample.objects.create(
                    sample_name=name,
                    bag=(row.get("bag") or "").strip() or None,
                    is_light=(kind == "light"),
                    is_dark=(kind == "dark"),
                    color_simulation=row.get("colorSimulation", "").strip(),
                    standard=standard,
                )

                raw_values = SpectroRawValues.objects.create(
                    raw_l=row["L"], raw_a=row["a"], raw_b=row["b"],
                    raw_c=row["C"], raw_h=row["h"],
                    lot_sample=lot_sample,
                )

                SpectroDeltaValues.objects.create(
                    delta_e=row["de"], delta_l=row["dL"], delta_a=row["da"],
                    delta_b=row["db"], delta_c=row["dC"], delta_h=row["dH"],
                    raw_values=raw_values,
                )

                de_value = float(row["de"])
                SpectroJudgement.objects.create(
                    color_offset=row.get("colorOffset", "").strip() or None,
                    is_pass=(de_value <= threshold),
                    spectro_remarks=row.get("remarks", "").strip() or None,
                    lot_sample=lot_sample,
                    standard=standard,
                )

                saved_ids.append(lot_sample.lot_samples_id)
    except Exception as e:
        return JsonResponse({
            "tone": "danger",
            "message": f"Failed to save readings — nothing was saved. ({e})",
        }, status=500)

    return JsonResponse({
        "tone": "success",
        "message": f"Saved {len(saved_ids)} sample reading(s).",
        "lot_sample_ids": saved_ids,
    })

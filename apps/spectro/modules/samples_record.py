"""
apps/spectro/modules/samples_record.py

Module for the "Samples Record".
"""
import io
import json

import openpyxl
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils import timezone

from apps.spectro.models import (
    SpectrometerRecord,
    SpectroStandard,
    StdLimitChangelog,
    LotSample,
    SpectroJudgement,
    VisualJudgement,
    SpecialCase,
    SpecialCaseChangelog,
)

def format_datetime_no_leading_zeros(dt):
    if not dt:
        return "-"
    return "{}/{}/{} {}:{:02d}".format(dt.month, dt.day, dt.year, dt.hour, dt.minute)

def _serialize_lot_sample_row(lot_sample, standards_id):
    raw = lot_sample.raw_values.order_by("-date_time").first()
    delta = raw.delta_values.order_by("-date_time").first() if raw else None
    spectro_j = (
        SpectroJudgement.objects
        .filter(lot_sample=lot_sample, standard_id=standards_id)
        .order_by("-date_time")
        .first()
    )
    visual_j = VisualJudgement.objects.filter(lot_sample=lot_sample).order_by("-date_time").first()
    special = SpecialCase.objects.filter(lot_sample=lot_sample).order_by("-date_time").first()

    def num(value):
        return float(value) if value is not None else None

    if spectro_j is None:
        spectro_judgement = "PASSED"  # default is_pass = True when no record exists yet
    elif spectro_j.is_pass is None:
        spectro_judgement = "PASSED"  # is_pass defaults to True
    else:
        spectro_judgement = "PASSED" if spectro_j.is_pass else "FAILED"

    if visual_j is None or visual_j.is_pass is None:
        visual_judgement = ""
    else:
        visual_judgement = "Pass" if visual_j.is_pass else "Fail"

    return {
        "id": lot_sample.lot_samples_id,
        "lotSampleId": lot_sample.lot_samples_id,
        "visualJudgementId": visual_j.visual_status_id if visual_j else None,
        "spectroJudgementId": spectro_j.spectro_status_id if spectro_j else None,
        "colorSimulation": lot_sample.color_simulation or "-",
        "dateTime": format_datetime_no_leading_zeros(lot_sample.date_time),
        "stickerLot": lot_sample.sample_name,
        "bag": "-",           # future use — from external QC program DB
        "internalLot": "-",   # future use — from external QC program DB
        "de00": num(delta.delta_e) if delta else None,
        "L": num(raw.raw_l) if raw else None,
        "C": num(raw.raw_c) if raw else None,
        "h": num(raw.raw_h) if raw else None,
        "a": num(raw.raw_a) if raw else None,
        "b": num(raw.raw_b) if raw else None,
        "dL": num(delta.delta_l) if delta else None,
        "dC": num(delta.delta_c) if delta else None,
        "dH": num(delta.delta_h) if delta else None,
        "da": num(delta.delta_a) if delta else None,
        "db": num(delta.delta_b) if delta else None,
        "colorOffset": spectro_j.color_offset if spectro_j and spectro_j.color_offset else "-",
        "spectroJudgement": spectro_judgement,
        "visualJudgement": visual_judgement,
        "finalQcEval": "-",  # no dedicated table yet — placeholder
        "reasonIfFail": visual_j.visual_fail_reason if visual_j and visual_j.visual_fail_reason else "",
        "spectroRemarks": spectro_j.spectro_remarks if spectro_j and spectro_j.spectro_remarks else "",
        "specialPass": bool(special.is_pass) if special else False,
        "specialPassBy": special.passed_by if special and special.passed_by else "",
    }

def _recalculate_spectro_judgements(record, threshold):
    """
    Re-evaluate is_pass for every lot sample under this record's standards
    against the new threshold. Matches by lot_sample (+ its standard) and
    updates the existing SpectroJudgement row in place -- same pattern as
    save_visual_judgement -- instead of inserting a new row per change.
    """
    standards = SpectroStandard.objects.filter(record=record)
    lot_samples = LotSample.objects.filter(standard__in=standards)

    for lot_sample in lot_samples:
        raw = lot_sample.raw_values.order_by("-date_time").first() # type: ignore
        delta = raw.delta_values.order_by("-date_time").first() if raw else None
        if delta is None:
            continue

        is_pass = float(delta.delta_e) <= threshold

        spectro_j, _ = SpectroJudgement.objects.get_or_create(
            lot_sample=lot_sample,
            defaults={"is_pass": is_pass, "standard": lot_sample.standard},
        )
        spectro_j.is_pass = is_pass
        spectro_j.standard = lot_sample.standard
        spectro_j.save(update_fields=["is_pass", "standard"])


@login_required
def render_samples_record(request):
    product_codes = (
        SpectrometerRecord.objects
        .order_by("product_code")
        .values_list("product_code", flat=True)
        .distinct()
    )
    product_code_options = [(code, code) for code in product_codes]

    context = {
        "product_code_options": product_code_options,
        "product_code_options_json": json.dumps(product_code_options),
    }
    return render(request, "pages/samples_record.html", context)


@login_required
def get_lot_samples_for_standard(request):
    standards_id = request.GET.get("standards_id", "").strip()
    if not standards_id:
        return JsonResponse({"tone": "danger", "message": "standards_id is required."}, status=400)

    lot_samples = (
        LotSample.objects
        .filter(standard_id=standards_id)
        .order_by("-date_time")
    )

    rows = [_serialize_lot_sample_row(ls, standards_id) for ls in lot_samples]

    return JsonResponse({"tone": "success", "message": "Samples loaded.", "rows": rows})


@login_required
def save_visual_judgement(request):
    if request.method != "POST":
        return JsonResponse({"tone": "danger", "message": "Invalid request method."}, status=405)

    lot_sample_id = request.POST.get("lot_sample_id", "").strip()
    value = request.POST.get("value", "").strip()  # "Pass" | "Fail" | ""

    if not lot_sample_id:
        return JsonResponse({"tone": "danger", "message": "lot_sample_id is required."}, status=400)

    lot_sample = LotSample.objects.filter(pk=lot_sample_id).first()
    if not lot_sample:
        return JsonResponse({"tone": "danger", "message": "Sample not found."}, status=404)

    is_pass = {"Pass": True, "Fail": False}.get(value, None)

    visual_j, _ = VisualJudgement.objects.get_or_create(
        lot_sample=lot_sample,
        defaults={"is_pass": is_pass, "judged_by": request.user.get_full_name() or request.user.username},
    )
    visual_j.is_pass = is_pass
    visual_j.judged_by = request.user.get_full_name() or request.user.username
    visual_j.save(update_fields=["is_pass", "judged_by"])

    return JsonResponse({"tone": "success", "message": "Visual judgement saved."})


@login_required
def save_visual_fail_reason(request):
    if request.method != "POST":
        return JsonResponse({"tone": "danger", "message": "Invalid request method."}, status=405)

    lot_sample_id = request.POST.get("lot_sample_id", "").strip()
    reason = request.POST.get("reason", "").strip()

    lot_sample = LotSample.objects.filter(pk=lot_sample_id).first()
    if not lot_sample:
        return JsonResponse({"tone": "danger", "message": "Sample not found."}, status=404)

    visual_j, _ = VisualJudgement.objects.get_or_create(
        lot_sample=lot_sample,
        defaults={"judged_by": request.user.get_full_name() or request.user.username},
    )
    visual_j.visual_fail_reason = reason
    visual_j.save(update_fields=["visual_fail_reason"])

    return JsonResponse({"tone": "success", "message": "Remarks saved."})


@login_required
def save_spectro_remarks(request):
    if request.method != "POST":
        return JsonResponse({"tone": "danger", "message": "Invalid request method."}, status=405)

    lot_sample_id = request.POST.get("lot_sample_id", "").strip()
    standards_id = request.POST.get("standards_id", "").strip()
    remarks = request.POST.get("remarks", "").strip()

    lot_sample = LotSample.objects.filter(pk=lot_sample_id).first()
    if not lot_sample or not standards_id:
        return JsonResponse({"tone": "danger", "message": "Sample or standard not found."}, status=404)

    spectro_j, _ = SpectroJudgement.objects.get_or_create(
        lot_sample=lot_sample,
        defaults={"spectro_remarks": remarks, "standard_id": standards_id},
    )
    spectro_j.spectro_remarks = remarks
    spectro_j.standard_id = standards_id # type: ignore
    spectro_j.save(update_fields=["spectro_remarks", "standard_id"])

    return JsonResponse({"tone": "success", "message": "Remarks saved."})


@login_required
def save_special_pass_by(request):
    if request.method != "POST":
        return JsonResponse({"tone": "danger", "message": "Invalid request method."}, status=405)

    lot_sample_id = request.POST.get("lot_sample_id", "").strip()
    value = request.POST.get("value", "").strip()

    if not lot_sample_id:
        return JsonResponse({"tone": "danger", "message": "lot_sample_id is required."}, status=400)
    if not value:
        return JsonResponse({"tone": "danger", "message": "Please select who passed this sample."}, status=400)

    lot_sample = LotSample.objects.filter(pk=lot_sample_id).first()
    if not lot_sample:
        return JsonResponse({"tone": "danger", "message": "Sample not found."}, status=404)

    special_case = SpecialCase.objects.filter(lot_sample=lot_sample).order_by("-date_time").first()

    if special_case and special_case.passed_by and special_case.passed_by != value:
        SpecialCaseChangelog.objects.create(
            special_case_ref=special_case,
            is_pass=special_case.is_pass,
            old_passed_by=special_case.passed_by,
            user=request.user,
        )

    if special_case:
        special_case.is_pass = True
        special_case.passed_by = value
        special_case.save(update_fields=["is_pass", "passed_by"])
    else:
        special_case = SpecialCase.objects.create(
            lot_sample=lot_sample,
            is_pass=True,
            passed_by=value,
        )

    return JsonResponse({"tone": "success", "message": "Special pass saved.", "passed_by": value})


@login_required
def save_std_delta_e_used(request):
    if request.method != "POST":
        return JsonResponse({"tone": "danger", "message": "Invalid request method."}, status=405)

    product_code = request.POST.get("product_code", "").strip()
    new_value_raw = request.POST.get("new_value", "").strip()

    if not product_code:
        return JsonResponse({"tone": "danger", "message": "product_code is required."}, status=400)

    if not new_value_raw:
        return JsonResponse({"tone": "danger", "message": "Standard ΔE value is required."}, status=400)

    try:
        new_value = float(new_value_raw)
    except ValueError:
        return JsonResponse({"tone": "danger", "message": "Standard ΔE must be a valid number."}, status=400)

    record = SpectrometerRecord.objects.filter(product_code=product_code).first()
    if not record:
        return JsonResponse({"tone": "danger", "message": "No spectrometer record found for this product code."}, status=404)

    old_value = record.std_delta_e_used

    if old_value is not None and new_value <= float(old_value):
        return JsonResponse({
            "tone": "danger",
            "message": "New value must be greater than the current Standard ΔE Used.",
        }, status=400)

    StdLimitChangelog.objects.create(
        record=record,
        old_std_delta_e=old_value,
        changed_by=request.user.get_full_name() or request.user.username,
        user=request.user,
    )

    record.std_delta_e_used = new_value # type: ignore
    record.save(update_fields=["std_delta_e_used"])

    _recalculate_spectro_judgements(record, new_value)

    return JsonResponse({
        "tone": "success",
        "message": "Standard ΔE Used updated successfully.",
        "std_delta_e_used": new_value,
    })


REPORT_COLUMNS = [
    ("colorSimulation", "Color Simulation"),
    ("dateTime", "Date Time"),
    ("code", "Code"),
    ("stickerLot", "Sticker Lot Number"),
    ("bag", "Bag Number"),
    ("internalLot", "Internal Lot"),
    ("de00", "ΔE*00"),
    ("L", "L*"),
    ("C", "C*"),
    ("h", "h°"),
    ("a", "a*"),
    ("b", "b*"),
    ("dL", "ΔL*"),
    ("dC", "ΔC*"),
    ("dH", "ΔH*"),
    ("da", "Δa*"),
    ("db", "Δb*"),
    ("colorOffset", "Color Offset"),
    ("spectroJudgement", "Spectro Judgement"),
    ("stdDeUsed", "STD ΔE used"),
    ("visualJudgement", "Visual Judgement"),
    ("finalQcEval", "Final QC Evaluation"),
    ("reasonIfFail", "Reason for Fail (if not color)"),
    ("spectroRemarks", "Spectro Remarks"),
    ("specialPass", "Special Pass?"),
    ("specialPassBy", "Special Pass BY:"),
]

REPORT_COLUMN_WIDTHS = [20, 17, 16, 22, 12, 12, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 14, 16, 13, 16, 18, 24, 20, 12, 16]


@login_required
def export_samples_report(request):
    """
    Builds the "Generate Report for this Product Code" Excel export.
    Pulls straight from the database using standards_id -- same query
    used to populate the table -- so the export always matches what the
    currently selected product code and standard are showing on screen.
    """
    standards_id = request.GET.get("standards_id", "").strip()
    if not standards_id:
        return JsonResponse({"tone": "danger", "message": "standards_id is required."}, status=400)

    standard = SpectroStandard.objects.filter(pk=standards_id).select_related("record").first()
    if not standard:
        return JsonResponse({"tone": "danger", "message": "Standard not found."}, status=404)

    record = standard.record
    product_code = record.product_code
    std_de_used = float(record.std_delta_e_used) if record.std_delta_e_used is not None else None

    lot_samples = LotSample.objects.filter(standard_id=standards_id).order_by("date_time")
    rows = [_serialize_lot_sample_row(ls, standards_id) for ls in lot_samples]
    # export needs real datetime objects (not the UI's display string) so Excel can sort/filter dates.
    # Excel/openpyxl can't hold timezone-aware datetimes, so convert to local time and strip tzinfo.
    for lot_sample, row in zip(lot_samples, rows):
        dt = lot_sample.date_time
        if dt and timezone.is_aware(dt):
            dt = timezone.localtime(dt).replace(tzinfo=None)
        row["dateTime"] = dt
        row["code"] = product_code
        row["stdDeUsed"] = std_de_used

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{product_code} from_spectro"[:31]

    header_font = Font(name="Roboto", size=11, bold=True, color="FF000000")
    header_fill = PatternFill(fill_type="solid", fgColor="FFFFFF00")

    for idx, (_key, label) in enumerate(REPORT_COLUMNS, start=1):
        cell = ws.cell(row=1, column=idx, value=label)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="left")

    for r_idx, row in enumerate(rows, start=2):
        for c_idx, (key, _label) in enumerate(REPORT_COLUMNS, start=1):
            value = row.get(key)
            cell = ws.cell(row=r_idx, column=c_idx, value=value)

            if key == "dateTime" and value:
                cell.number_format = "m/d/yyyy h:mm"

            if key == "colorSimulation" and isinstance(value, str) and value.startswith("#") and len(value) in (7, 9):
                hexval = value.lstrip("#")
                if len(hexval) == 6:
                    hexval = "FF" + hexval
                try:
                    cell.fill = PatternFill(fill_type="solid", fgColor=hexval)
                except ValueError:
                    pass

    last_row = max(len(rows) + 1, 2)
    last_col_letter = get_column_letter(len(REPORT_COLUMNS))

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{last_col_letter}{last_row}"

    green = Font(color="FF00B050")
    red = Font(color="FFFF0000")
    for rng in (f"S2:S{last_row}", f"U2:U{last_row}"):
        ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Pass"'], font=green))
        ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Passed"'], font=green))
        ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Fail"'], font=red))
        ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Failed"'], font=red))

    for idx, w in enumerate(REPORT_COLUMN_WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = w

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    filename = f"{product_code} from_spectro.xlsx"
    response = HttpResponse(
        buffer.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@login_required
def get_standards_for_product_code(request):
    product_code = request.GET.get("product_code", "").strip()
    if not product_code:
        return JsonResponse({"tone": "danger", "message": "product_code is required."}, status=400)

    record = SpectrometerRecord.objects.filter(product_code=product_code).first()
    if not record:
        return JsonResponse({
            "tone": "info",
            "message": "No spectrometer record found for this product code.",
            "standards": [],
            "std_delta_e_used": None,
        })

    standards = list(
        SpectroStandard.objects
        .filter(record=record)
        .order_by("-is_active_standard", "-date_time")
        .values("standards_id", "standard_name")
    )

    return JsonResponse({
        "tone": "success",
        "message": "Standards loaded.",
        "standards": standards,
        "std_delta_e_used": (
            float(record.std_delta_e_used) if record.std_delta_e_used is not None else None
        ),
    })


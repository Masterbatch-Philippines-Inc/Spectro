"""
apps/spectro/views.py

Orchestrator only. Each view here delegates to a single-responsibility
function living in apps/spectro/modules/. No business logic belongs
in this file -- it just receives the request and hands it off.
"""

from apps.spectro.modules.authentication import render_login, do_logout
from apps.spectro.modules.samples_reader import ( 
    render_samples_reader, 
    get_spectrometer_info, 
    save_spectrometer_info, 
    save_product_code, 
    save_standard, 
    save_sample_readings, 
    check_lot_exists, )
from apps.spectro.modules.samples_record import (
    render_samples_record,
    get_standards_for_product_code,
    save_std_delta_e_used,
    get_lot_samples_for_standard,
    save_visual_judgement,
    save_visual_fail_reason,
    save_spectro_remarks,
    save_special_pass_by,
    export_samples_report,
)


def login_view(request):
    return render_login(request)

def logout_view(request):
    return do_logout(request)

def samples_reader_view(request):
    return render_samples_reader(request)

def spectrometer_info_view(request):
    return get_spectrometer_info(request)

def save_spectrometer_info_view(request):
    return save_spectrometer_info(request)

def save_product_code_view(request):
    return save_product_code(request)

def save_standard_view(request):
    return save_standard(request)

def save_sample_readings_view(request):
    return save_sample_readings(request)

def check_lot_exists_view(request):
    return check_lot_exists(request)

def samples_record_view(request):
    return render_samples_record(request)

def standards_for_product_code_view(request):
    return get_standards_for_product_code(request)

def save_std_delta_e_used_view(request):
    return save_std_delta_e_used(request)

def lot_samples_for_standard_view(request):
    return get_lot_samples_for_standard(request)

def save_visual_judgement_view(request):
    return save_visual_judgement(request)

def save_visual_fail_reason_view(request):
    return save_visual_fail_reason(request)

def save_spectro_remarks_view(request):
    return save_spectro_remarks(request)

def save_special_pass_by_view(request):
    return save_special_pass_by(request)

def export_samples_report_view(request):
    return export_samples_report(request)

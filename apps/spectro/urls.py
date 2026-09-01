from django.urls import path
from apps.spectro import views

urlpatterns = [
    path("",                                views.login_view,                           name="auth_login"                       ),
    path("logout/",                         views.logout_view,                          name="auth_logout"                      ),
 
    # Samples Reader
    path("samples-reader/",                 views.samples_reader_view,                  name="samples_reader"                   ),
    path("spectrometer-info/",              views.spectrometer_info_view,               name="api_spectrometer_info"            ),
    path("spectrometer-info/save/",         views.save_spectrometer_info_view,          name="api_save_spectrometer_info"       ),
    path("product-code/save/",              views.save_product_code_view,               name="api_save_product_code"            ),
    path("standard/save/",                  views.save_standard_view,                   name="api_save_standard"                ),
    path("samples/save/",                   views.save_sample_readings_view,            name="api_save_sample_readings"         ),
    path("samples/check-lot/",              views.check_lot_exists_view,                name="api_check_lot_exists"             ),
 
    # Samples Record
    path("samples-record/",                 views.samples_record_view,                  name="samples_record"                   ),
    path("standards/",                      views.standards_for_product_code_view,      name="api_standards_for_product_code"   ),
    path("std-delta-e/",                    views.save_std_delta_e_used_view,           name="api_save_std_delta_e"             ),
    path("lot-samples/",                    views.lot_samples_for_standard_view,        name="api_lot_samples_for_standard"     ),
    path("visual-judgement/",               views.save_visual_judgement_view,           name="api_save_visual_judgement"        ),
    path("visual-judgement/reason/",        views.save_visual_fail_reason_view,         name="api_save_visual_fail_reason"      ),
    path("spectro-judgement/remarks/",      views.save_spectro_remarks_view,            name="api_save_spectro_remarks"         ),
    path("special-pass/",                   views.save_special_pass_by_view,            name="api_save_special_pass_by"         ),
    path("samples-report/",                 views.export_samples_report_view,           name="api_export_samples_report"        ),
]

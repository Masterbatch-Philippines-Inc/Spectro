from django.urls import path
from apps.spectro import views

urlpatterns = [
    path("",                                views.login_view,                       name="auth_login"                       ),
    path("logout/",                         views.logout_view,                      name="auth_logout"                      ),
 
    # Samples Reader
    path("samples-reader/",                 views.samples_reader_view,              name="samples_reader"                   ),
    path("api/spectrometer-info/",          views.spectrometer_info_view,           name="api_spectrometer_info"            ),
    path("api/product-code/save/",          views.save_product_code_view,           name="api_save_product_code"            ),
    path("api/standard/save/",              views.save_standard_view,               name="api_save_standard"                ),
    path("api/samples/save/",               views.save_sample_readings_view,        name="api_save_sample_readings"         ),
 
    # Samples Record
    path("samples-record/",                 views.samples_record_view,              name="samples_record"                   ),
    path("api/standards/",                  views.standards_for_product_code_view,  name="api_standards_for_product_code"   ),
    path("api/std-delta-e/",                views.save_std_delta_e_used_view,       name="api_save_std_delta_e"             ),
    path("api/lot-samples/",                views.lot_samples_for_standard_view,    name="api_lot_samples_for_standard"     ),
    path("api/visual-judgement/",           views.save_visual_judgement_view,       name="api_save_visual_judgement"        ),
    path("api/visual-judgement/reason/",    views.save_visual_fail_reason_view,     name="api_save_visual_fail_reason"      ),
    path("api/spectro-judgement/remarks/",  views.save_spectro_remarks_view,        name="api_save_spectro_remarks"         ),
    path("api/special-pass/",               views.save_special_pass_by_view,        name="api_save_special_pass_by"         ),
    path("api/samples-report/",             views.export_samples_report_view,       name="api_export_samples_report"        ),
]

from django.urls import path

from apps.spectro import views

urlpatterns = [
    path("", views.login_view, name="auth_login"),
    path("logout/", views.logout_view, name="auth_logout"),
    path("samples-reader/", views.samples_reader_view, name="samples_reader"),
    path("samples-record/", views.samples_record_view, name="samples_record"),
    path("api/standards/", views.standards_for_product_code_view, name="api_standards_for_product_code"),
    path("api/std-delta-e/", views.save_std_delta_e_used_view, name="api_save_std_delta_e"),
    path("api/lot-samples/", views.lot_samples_for_standard_view, name="api_lot_samples_for_standard"),
    path("api/visual-judgement/", views.save_visual_judgement_view, name="api_save_visual_judgement"),
    path("api/visual-judgement/reason/", views.save_visual_fail_reason_view, name="api_save_visual_fail_reason"),
    path("api/spectro-judgement/remarks/", views.save_spectro_remarks_view, name="api_save_spectro_remarks"),
]

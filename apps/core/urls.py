from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("apps.spectro.urls")),
]

handler400 = "apps.spectro.modules.handlers.handler400"
handler403 = "apps.spectro.modules.handlers.handler403"
handler404 = "apps.spectro.modules.handlers.handler404"
handler500 = "apps.spectro.modules.handlers.handler500"

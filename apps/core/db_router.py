"""
apps/core/db_router.py

Routes QcProgramRecord (apps/spectro/models/spectro_models.py) to the
'server' database alias defined in settings.DATABASES -- it lives in a
physically separate Postgres instance under schema/views as
"view_spectro", not in this project's own 'default' database.

Every other model in this project stays on 'default' as normal --
this router only intercepts the one model_name it names explicitly.
"""

QC_PROGRAM_RECORD_APP_LABEL = "spectro"
QC_PROGRAM_RECORD_MODEL_NAME = "qcprogramrecord"


class QcProgramRouter:
    def _is_qc_program_record(self, model):
        return (
            model._meta.app_label == QC_PROGRAM_RECORD_APP_LABEL
            and model._meta.model_name == QC_PROGRAM_RECORD_MODEL_NAME
        )

    def db_for_read(self, model, **hints):
        if self._is_qc_program_record(model):
            return "server"
        return None

    def db_for_write(self, model, **hints):
        # view_spectro is a VIEW on the server DB -- treated as read-only
        # from this project (see QcProgramRecord's docstring). Still
        # routed to 'server' rather than blocked outright, in case the
        # view is genuinely updatable; Postgres itself will reject the
        # write if it isn't.
        if self._is_qc_program_record(model):
            return "server"
        return None

    def allow_relation(self, obj1, obj2, **hints):
        # QcProgramRecord has no FK relations to/from this project's own
        # models, so nothing to allow across the default/server split.
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # Never migrate QcProgramRecord anywhere -- it's an unmanaged
        # view on a database this project doesn't own migrations for.
        if app_label == QC_PROGRAM_RECORD_APP_LABEL and model_name == QC_PROGRAM_RECORD_MODEL_NAME:
            return False
        # Everything else (this project's own models) only migrates on
        # 'default' -- never accidentally onto 'server'.
        if db == "server":
            return False
        return None
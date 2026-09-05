"""
apps/spectro/models/spectro_models.py

Domain models plotted directly from the ERD screenshot
(NEW_SPECTRO_ERD-Database_Diagram.png). Structure only -- no extra
business logic here.
"""

from django.conf import settings
from django.db import models


class QcProgramRecord(models.Model):
    """
    Maps to the "from qc program db" data. This is NOT a table owned by
    this project -- it's a VIEW (`view_spectro`), living under a
    separate schema in a physically different Postgres instance (the
    'server' entry in settings.DATABASES, see apps/core/settings.py and
    apps/core/db_router.py). Two things make this different from a
    normal Django model:

      1. `managed = False` -- Django never creates/alters/drops this via
         migrations regardless of database, since it's a view, not a
         table this project owns.
      2. Routing to the 'server' database alias happens via
         QcProgramRouter (apps/core/db_router.py), registered in
         DATABASE_ROUTERS -- managed=False alone only stops migrations,
         it does NOT send queries to a different DB connection.

    Being a view, this should be treated as READ-ONLY from this project
    -- .save()/.delete() will very likely fail against Postgres unless
    the view happens to be updatable, and that's not something to rely
    on. Task 6 (views.py adjustments) picks up from here.
    """

    qc_id = models.AutoField(primary_key=True)
    product_code = models.CharField(max_length=100, blank=True, null=True)
    sticker_lot = models.CharField(max_length=100, blank=True, null=True)
    bag_number = models.CharField(max_length=100, blank=True, null=True)
    internal_lot = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=100, blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "view_spectro"

    def __str__(self):
        return f"QC#{self.qc_id} {self.product_code}"


class Spectrometer(models.Model):
    spectro_id = models.AutoField(primary_key=True)
    date_time = models.DateTimeField(auto_now_add=True)
    device_sn = models.CharField(max_length=100)
    device_model = models.CharField(max_length=100)

    class Meta:
        db_table = "spectrometer"

    def __str__(self):
        return f"{self.device_model} ({self.device_sn})"


class SpectrometerRecord(models.Model):
    record_id = models.AutoField(primary_key=True)
    product_code = models.CharField(max_length=100, unique=True)
    std_delta_e_used = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    spectro = models.ForeignKey(
        Spectrometer, on_delete=models.SET_NULL, blank=True, null=True,
        related_name="records", db_column="spectro_id",
    )

    class Meta:
        db_table = "spectrometer_records"

    def __str__(self):
        return self.product_code


class SpectroStandard(models.Model):
    standards_id = models.AutoField(primary_key=True)
    standard_name = models.CharField(max_length=255)
    date_time = models.DateTimeField(auto_now_add=True)
    is_active_standard = models.BooleanField(default=True)
    # Raw L*a*b*C*h values captured during Step 2 "Capture Reflectance".
    # default=0.00 exists only to satisfy the migration for existing rows --
    # application code (save_standard) rejects missing/blank values on
    # every new save, so 0.00 should never appear on a newly created row.
    raw_l = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    raw_a = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    raw_b = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    raw_c = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    raw_h = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    record = models.ForeignKey(
        SpectrometerRecord, on_delete=models.CASCADE,
        related_name="standards", db_column="record_id",
    )

    class Meta:
        db_table = "spectro_standards"

    def __str__(self):
        return self.standard_name


class StdLimitChangelog(models.Model):
    std_limit_logs_id = models.AutoField(primary_key=True)
    date_time = models.DateTimeField(auto_now_add=True)
    old_std_delta_e = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    changed_by = models.CharField(max_length=150, blank=True, null=True)
    record = models.ForeignKey(
        SpectrometerRecord, on_delete=models.CASCADE,
        related_name="std_limit_changelogs", db_column="record_id",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True,
        related_name="std_limit_changelogs", db_column="users_id",
    )

    class Meta:
        db_table = "std_limit_changelogs"


class LotSample(models.Model):
    lot_samples_id = models.AutoField(primary_key=True)
    date_time = models.DateTimeField(auto_now_add=True)
    sample_name = models.CharField(max_length=100)  # default = "sample" + n
    bag = models.CharField(max_length=50, blank=True, null=True)
    is_light = models.BooleanField(default=False)
    is_dark = models.BooleanField(default=False)
    color_simulation = models.CharField(max_length=20, blank=True, null=True)
    standard = models.ForeignKey(
        SpectroStandard, on_delete=models.CASCADE,
        related_name="lot_samples", db_column="standards_id",
    )

    class Meta:
        db_table = "lot_samples"

    def __str__(self):
        return self.sample_name


class SpectroRawValues(models.Model):
    raw_values_id = models.AutoField(primary_key=True)
    date_time = models.DateTimeField(auto_now_add=True)
    raw_l = models.DecimalField(max_digits=8, decimal_places=4)
    raw_a = models.DecimalField(max_digits=8, decimal_places=4)
    raw_b = models.DecimalField(max_digits=8, decimal_places=4)
    raw_c = models.DecimalField(max_digits=8, decimal_places=4)
    raw_h = models.DecimalField(max_digits=8, decimal_places=4)
    lot_sample = models.ForeignKey(
        LotSample, on_delete=models.CASCADE,
        related_name="raw_values", db_column="lot_samples_id",
    )

    class Meta:
        db_table = "spectro_raw_values"


class SpectroDeltaValues(models.Model):
    delta_values_id = models.AutoField(primary_key=True)
    date_time = models.DateTimeField(auto_now_add=True)
    delta_e = models.DecimalField(max_digits=8, decimal_places=4)
    delta_l = models.DecimalField(max_digits=8, decimal_places=4)
    delta_a = models.DecimalField(max_digits=8, decimal_places=4)
    delta_b = models.DecimalField(max_digits=8, decimal_places=4)
    delta_c = models.DecimalField(max_digits=8, decimal_places=4)
    delta_h = models.DecimalField(max_digits=8, decimal_places=4)
    raw_values = models.ForeignKey(
        SpectroRawValues, on_delete=models.CASCADE,
        related_name="delta_values", db_column="raw_values_id",
    )

    class Meta:
        db_table = "spectro_delta_values"


class VisualJudgement(models.Model):
    visual_status_id = models.AutoField(primary_key=True)
    date_time = models.DateTimeField(auto_now_add=True)
    is_pass = models.BooleanField(blank=True, null=True)
    judged_by = models.CharField(max_length=150, blank=True, null=True)  # dropdown-chosen
    visual_fail_reason = models.TextField(blank=True, null=True)
    lot_sample = models.ForeignKey(
        LotSample, on_delete=models.CASCADE,
        related_name="visual_judgements", db_column="lot_samples_id",
    )

    class Meta:
        db_table = "visual_judgement"


class SpectroJudgement(models.Model):
    spectro_status_id = models.AutoField(primary_key=True)
    date_time = models.DateTimeField(auto_now_add=True)
    color_offset = models.CharField(max_length=100, blank=True, null=True)
    is_pass = models.BooleanField(default=True, blank=True, null=True)
    spectro_remarks = models.TextField(blank=True, null=True)
    # Per-row snapshot of the STD ΔE Used this row was last evaluated
    # against. NOT the same as SpectrometerRecord.std_delta_e_used (the
    # record's current global value) -- this only ratchets upward, and
    # only when a threshold change causes this row to newly PASS. A
    # threshold change that leaves the row failing, or that isn't
    # needed for it to pass, never updates this value. LT/DR reference
    # rows are always treated as fixed at 1.00 (enforced in views, not
    # stored here differently).
    std_de_used = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    lot_sample = models.ForeignKey(
        LotSample, on_delete=models.CASCADE,
        related_name="spectro_judgements", db_column="lot_samples_id",
    )
    standard = models.ForeignKey(
        SpectroStandard, on_delete=models.CASCADE,
        related_name="spectro_judgements", db_column="standards_id",
    )

    class Meta:
        db_table = "spectro_judgement"


class SpectroJudgementChangelog(models.Model):
    spectro_status_logs_id = models.AutoField(primary_key=True)
    date_time = models.DateTimeField(auto_now_add=True)
    is_fail = models.BooleanField(blank=True, null=True)
    old_spectro_remarks = models.TextField(blank=True, null=True)
    changed_by = models.CharField(max_length=150, blank=True, null=True)
    standard = models.ForeignKey(
        SpectroStandard, on_delete=models.CASCADE,
        related_name="judgement_changelogs", db_column="standards_id",
    )
    lot_sample = models.ForeignKey(
        LotSample, on_delete=models.CASCADE,
        related_name="judgement_changelogs", db_column="lot_samples_id",
    )
    spectro_status = models.ForeignKey(
        SpectroJudgement, on_delete=models.CASCADE,
        related_name="changelogs", db_column="spectro_status_id",
    )

    class Meta:
        db_table = "spectro_judgement_changelogs"


class SpecialCase(models.Model):
    special_case_id = models.AutoField(primary_key=True)
    date_time = models.DateTimeField(auto_now_add=True)
    is_pass = models.BooleanField(blank=True, null=True)
    passed_by = models.CharField(max_length=150, blank=True, null=True)  # dropdown-chosen
    lot_sample = models.ForeignKey(
        LotSample, on_delete=models.CASCADE,
        related_name="special_cases", db_column="lot_samples_id",
    )

    class Meta:
        db_table = "special_case"


class SpecialCaseChangelog(models.Model):
    special_case_id = models.AutoField(primary_key=True)
    date_time = models.DateTimeField(auto_now_add=True)
    is_pass = models.BooleanField(blank=True, null=True)
    old_passed_by = models.CharField(max_length=150, blank=True, null=True)
    special_case_ref = models.ForeignKey(
        SpecialCase, on_delete=models.CASCADE,
        related_name="changelogs", db_column="special_case_id_ref",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True,
        related_name="special_case_changelogs", db_column="users_id",
    )

    class Meta:
        db_table = "special_case_changelogs"

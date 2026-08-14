"""
apps/spectro/models/__init__.py

Django only auto-discovers models declared in `<app>/models.py` or
imported through `<app>/models/__init__.py`. Both model files are
re-exported here so `makemigrations`/`migrate` pick everything up.
"""

from .auth_models import User
from .spectro_models import (
    QcProgramRecord,
    Spectrometer,
    SpectrometerRecord,
    SpectroStandard,
    StdLimitChangelog,
    LotSample,
    SpectroRawValues,
    SpectroDeltaValues,
    VisualJudgement,
    SpectroJudgement,
    SpectroJudgementChangelog,
    SpecialCase,
    SpecialCaseChangelog,
)

__all__ = [
    "User",
    "QcProgramRecord",
    "Spectrometer",
    "SpectrometerRecord",
    "SpectroStandard",
    "StdLimitChangelog",
    "LotSample",
    "SpectroRawValues",
    "SpectroDeltaValues",
    "VisualJudgement",
    "SpectroJudgement",
    "SpectroJudgementChangelog",
    "SpecialCase",
    "SpecialCaseChangelog",
]

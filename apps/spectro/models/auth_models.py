"""
apps/spectro/models/auth_models.py

Auth-related model(s). Maps to the `users` table in the ERD.
Django's AbstractUser already provides: password, username, first_name,
last_name, email, is_superuser, is_staff, is_active, date_joined,
last_login -- so we subclass it directly rather than reinventing it.
"""

from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Project's custom user model (settings.AUTH_USER_MODEL = 'spectro.User')."""

    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return self.username

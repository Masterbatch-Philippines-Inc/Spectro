@echo off
title Spectro (Port 9001)

cd /d "%~dp0"

call .venv\Scripts\activate.bat

python manage.py runserver 0.0.0.0:9001

pause
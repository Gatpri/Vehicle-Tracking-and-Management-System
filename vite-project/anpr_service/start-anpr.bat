@echo off
REM Double-click to start the ANPR inference service.
REM Close this window (or press Ctrl+C) to stop it — that is also how you
REM "restart" it after swapping in retrained weights.
title ANPR inference service
cd /d "%~dp0"
echo Starting ANPR inference service...
echo Close this window to stop it.
echo.
python server.py
echo.
echo === The service has stopped. ===
pause

@echo off
title The Ingredient DigOut - Shutdown
cd /d "%~dp0"
echo Stopping all DigOut containers...
docker compose down
echo.
echo All DigOut services have been stopped.
timeout /t 3

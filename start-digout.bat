@echo off
title The Ingredient DigOut - One-Click Launcher
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start-digout.ps1"
pause

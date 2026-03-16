@echo off
title English Practice App
cd /d "%~dp0"
echo.
echo  ========================================
echo   English Practice App
echo  ========================================
echo.
echo  Starting server...
echo  Open browser: http://127.0.0.1:8765
echo.
start http://127.0.0.1:8765
node server.js
pause

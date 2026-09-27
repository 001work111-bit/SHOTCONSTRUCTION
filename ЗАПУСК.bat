@echo off
rem ------------------------------------------------------------------
rem  Visual Constructor - zapusk v odno dvoynoy klik
rem  VNIMMANIE: v etom fayle tolko ASCII-simvoly!
rem  Russkiy tekst pechataet scripts\launch.cjs (Node umeyet UTF-8).
rem  Esli syuda pisat russkie bukvy, cmd.exe lomayet stroki.
rem ------------------------------------------------------------------
chcp 65001 >nul
cd /d "%~dp0"
title Visual Constructor - zapusk

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   [OSHI BKA] Node.js ne nayden.
    echo.
    echo   Nuzhno odin raz ustanovit Node.js:
    echo     1. Otkroyte sayt https://nodejs.org
    echo     2. Nazhmite bolshuyu knopku LTS - skachaetsya ustanovshchik
    echo     3. Zapustite ego i nazhimayte "Daley" - "Gotovo"
    echo     4. Zakroyte eto okno i snova zapustite ZAPUSK.bat
    echo.
    pause
    exit /b 1
)

node "%~dp0scripts\launch.cjs"
if errorlevel 1 (
    echo.
    echo   Proizoshla oshibka - prochitayte soobshcheniya vyshe.
    echo.
)
pause

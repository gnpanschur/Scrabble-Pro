@echo off
title Scrabble-Pro Starter

echo ===================================================
echo             Scrabble-Pro wird gestartet            
echo ===================================================
echo.

rem Wechselt in das Verzeichnis der Batch-Datei, um relative Pfade abzusichern
cd /d "%~dp0"

rem Ueberpruefen, ob Node.js installiert ist
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [FEHLER] Node.js wurde nicht gefunden!
    echo Bitte installiere Node.js von: https://nodejs.org/
    echo.
    pause
    exit /b
)

rem Ueberpruefen, ob node_modules existiert
if not exist node_modules (
    echo [INFO] node_modules nicht gefunden. Installiere Abhaengigkeiten...
    call npm install
    if %errorlevel% neq 0 (
        echo [FEHLER] Fehler bei der Installation der npm-Pakete.
        pause
        exit /b
    )
)

rem Oeffne die Spielseite im Standardbrowser
echo [INFO] Oeffne http://localhost:3000 im Browser...
start http://localhost:3000

rem Starte den Server
echo [INFO] Starte den Server (node server.js)...
echo [INFO] Druecke Strg+C in diesem Fenster, um den Server zu beenden.
echo ---------------------------------------------------
node server.js

pause

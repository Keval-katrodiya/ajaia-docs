@echo off
setlocal enabledelayedexpansion
title Ajaia Docs - setup and run

rem ===========================================================================
rem  Ajaia Docs - one-click setup and run
rem
rem  Double-click this file. It checks Node, installs dependencies, seeds the
rem  demo database, picks a free port, starts the server and opens the browser.
rem
rem  Usage:
rem    SETUP-AND-RUN.bat           install if needed, seed if needed, run in dev mode
rem    SETUP-AND-RUN.bat prod      production build, then serve it
rem    SETUP-AND-RUN.bat reset     wipe and reseed the database, then run
rem    SETUP-AND-RUN.bat test      run the test suite and stop
rem    SETUP-AND-RUN.bat help      show this list
rem ===========================================================================

cd /d "%~dp0"

echo.
echo   ===============================================
echo     A J A I A   D O C S
echo     collaborative document editor
echo   ===============================================
echo.

set "MODE=dev"
if /i "%~1"=="prod"  set "MODE=prod"
if /i "%~1"=="reset" set "MODE=reset"
if /i "%~1"=="test"  set "MODE=test"
if /i "%~1"=="help"  goto :usage
if /i "%~1"=="/?"    goto :usage
if /i "%~1"=="-h"    goto :usage

rem --------------------------------------------------------------- sanity ---
if not exist "package.json" (
    echo   [X] package.json not found.
    echo       This file must stay inside the ajaia-docs folder.
    goto :fail
)

rem ----------------------------------------------------------------- node ---
where node >nul 2>nul
if errorlevel 1 (
    echo   [X] Node.js is not installed, or not on your PATH.
    echo.
    echo       Install the LTS build from https://nodejs.org
    echo       then close this window and run SETUP-AND-RUN.bat again.
    goto :fail
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node" 2^>nul') do set "NODE_MAJOR=%%v"
for /f "delims=" %%v in ('node -p "process.versions.node" 2^>nul') do set "NODE_FULL=%%v"

if not defined NODE_MAJOR (
    echo   [X] Node.js is installed but did not respond correctly.
    goto :fail
)

if !NODE_MAJOR! LSS 20 (
    echo   [X] Node !NODE_FULL! is too old. This project needs Node 20.9 or newer.
    echo       Update from https://nodejs.org and run SETUP-AND-RUN.bat again.
    goto :fail
)

echo   Node !NODE_FULL!  -  ok
echo.

rem ------------------------------------------------------- 1. dependencies ---
if exist "node_modules\.package-lock.json" (
    echo   [1/3] Dependencies already installed - skipping.
) else (
    echo   [1/3] Installing dependencies. First run takes 1-3 minutes...
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo   [X] npm install failed.
        echo       Most common cause: no internet connection, or a proxy blocking npm.
        echo       Try running  npm install  by hand to see the full error.
        goto :fail
    )
    echo.
    echo         Dependencies installed.
)

rem ------------------------------------------------------------- 2. tests ---
if /i "%MODE%"=="test" (
    echo   [2/2] Running the test suite...
    echo.
    call npm test
    if errorlevel 1 (
        echo.
        echo   [X] Tests failed.
        goto :fail
    )
    echo.
    echo   All tests passed.
    goto :done
)

rem -------------------------------------------------------------- 2. seed ---
if /i "%MODE%"=="reset" (
    echo   [2/3] Wiping and reseeding the database...
    echo.
    call npm run seed:reset
    if errorlevel 1 goto :seedfail
) else (
    if exist "data\app.db" (
        echo   [2/3] Database already set up - skipping seed.
        echo         Run  SETUP-AND-RUN.bat reset  for a clean demo database.
    ) else (
        echo   [2/3] Creating and seeding the demo database...
        echo.
        call npm run seed
        if errorlevel 1 goto :seedfail
    )
)

rem --------------------------------------------------------------- 3. port ---
rem Next.js reads PORT, so picking a free one here keeps the URL we print and
rem the URL we open in the browser honest even if 3000 is already taken.
set "PORT=3000"
set /a PORT_TRIES=0

:portloop
netstat -ano 2>nul | findstr /c:":!PORT! " | findstr /i "LISTENING" >nul
if not errorlevel 1 (
    set /a PORT_TRIES=!PORT_TRIES!+1
    set /a PORT=!PORT!+1
    if !PORT_TRIES! LSS 12 goto :portloop
)

if not "!PORT!"=="3000" (
    echo.
    echo         Port 3000 was busy - using !PORT! instead.
)

set "APP_URL=http://localhost:!PORT!"

rem --------------------------------------------------------------- 3. run ---
echo.
echo   [3/3] Starting the server...
echo.
echo   ===============================================
echo     Open:  !APP_URL!
echo.
echo     Sign in by CLICKING A NAME - there are no
echo     passwords. Seeded accounts:
echo.
echo       Keval Katrodiya    keval@ajaia.test
echo       Priya Sharma       priya@ajaia.test
echo       Sam Okoro          sam@ajaia.test
echo.
echo     To demo sharing, sign in as two people at
echo     once: one normal window, one private window.
echo.
echo     Sample files to import are in  samples\
echo.
echo     Press Ctrl+C in this window to stop.
echo   ===============================================
echo.

rem Open the browser once the server has had time to boot. Runs in its own
rem minimised window so it cannot block the server starting.
start "Ajaia Docs" /min cmd /c "timeout /t 8 /nobreak >nul & start !APP_URL!"

if /i "%MODE%"=="prod" (
    echo   Building for production...
    echo.
    call npm run build
    if errorlevel 1 (
        echo.
        echo   [X] Production build failed.
        goto :fail
    )
    echo.
    call npm start
) else (
    call npm run dev
)

echo.
echo   Server stopped.
goto :done

rem --------------------------------------------------------------- exits ---
:seedfail
echo.
echo   [X] Seeding the database failed.
echo       If the app is already running in another window, close it first -
echo       it holds the database file open.
goto :fail

:usage
echo   Usage:
echo.
echo     SETUP-AND-RUN.bat           install if needed, seed if needed, run in dev mode
echo     SETUP-AND-RUN.bat prod      production build, then serve it
echo     SETUP-AND-RUN.bat reset     wipe and reseed the database, then run
echo     SETUP-AND-RUN.bat test      run the test suite and stop
echo     SETUP-AND-RUN.bat help      show this list
echo.
goto :done

:fail
echo.
echo   Setup stopped. Nothing was left running.
echo.
pause
exit /b 1

:done
echo.
pause
exit /b 0

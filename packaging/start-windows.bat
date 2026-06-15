@echo off
setlocal
cd /d "%~dp0app"
set PORT=8765
set URL=http://localhost:%PORT%/

where py >nul 2>nul
if %errorlevel%==0 (
  start "WaveRider server" py -m http.server %PORT%
  goto open
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "WaveRider server" python -m http.server %PORT%
  goto open
)
where npx >nul 2>nul
if %errorlevel%==0 (
  start "WaveRider server" npx --yes serve -l %PORT% .
  goto open
)

echo.
echo Could not find Python 3 or Node.js on this PC.
echo Please install Python from https://www.python.org/ and run this again.
echo.
pause
exit /b 1

:open
timeout /t 2 /nobreak >nul
start "" "%URL%"
echo.
echo WaveRider is running at %URL%
echo Close the "WaveRider server" window to stop it.
echo.

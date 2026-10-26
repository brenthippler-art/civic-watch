@echo off
cd /d "%~dp0"
if not exist "data\logs" mkdir "data\logs"
echo ===== %date% %time% ===== >> "data\logs\run.log"

call npm test >> "data\logs\run.log" 2>&1
if errorlevel 1 (
  echo TESTS FAILED: collecting data but NOT publishing or sending alerts. >> "data\logs\run.log"
  node --env-file=.env src\index.js --no-publish --no-email >> "data\logs\run.log" 2>&1
  exit /b 1
)

node --env-file=.env src\index.js >> "data\logs\run.log" 2>&1
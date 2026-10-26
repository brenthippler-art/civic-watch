@echo off
cd /d "%~dp0"
if not exist "data\logs" mkdir "data\logs"
echo ===== %date% %time% ===== >> "data\logs\run.log"
node src\index.js >> "data\logs\run.log" 2>&1
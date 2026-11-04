@echo off
cd /d "%~dp0"
taskkill /f /im "PeppeZ Easy Converter.exe" >nul 2>&1
taskkill /f /im "PeppeZ Convert.exe" >nul 2>&1
taskkill /f /im "filee-cli.exe" >nul 2>&1
taskkill /f /im "Filee.exe" >nul 2>&1
taskkill /f /im "rhwp.exe" >nul 2>&1
taskkill /f /im "electron.exe" >nul 2>&1
if exist "dist\win-unpacked" rmdir /s /q "dist\win-unpacked" >nul 2>&1
call npm install || goto err
if not exist engine\filee call npm run get-filee || goto err
call npm run build || goto err
echo.
echo Fatto: trovi installer e versione portabile nella cartella "dist".
pause
exit /b
:err
echo Qualcosa e' andato storto. Controlla i messaggi sopra.
pause

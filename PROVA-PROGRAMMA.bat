@echo off
cd /d "%~dp0"
if not exist node_modules call npm install || goto err
if not exist engine\filee call npm run get-filee || goto err
call npm start
exit /b
:err
echo Qualcosa e' andato storto. Controlla i messaggi sopra.
pause

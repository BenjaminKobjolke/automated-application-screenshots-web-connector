@echo off
setlocal
echo === Building project ===
npm run build
if errorlevel 1 exit /b %ERRORLEVEL%
npx --no-install vitest run tests/unit --reporter verbose
exit /b %ERRORLEVEL%

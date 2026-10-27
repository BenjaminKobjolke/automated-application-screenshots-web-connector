@echo off
setlocal
npm run build
if errorlevel 1 exit /b %ERRORLEVEL%
npx vitest run tests/unit --reporter verbose
exit /b %ERRORLEVEL%

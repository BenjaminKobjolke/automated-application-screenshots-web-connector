@echo off
call "%~dp0analyze_code.bat" changed
exit /b %ERRORLEVEL%

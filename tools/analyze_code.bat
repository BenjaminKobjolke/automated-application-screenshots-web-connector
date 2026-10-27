@echo off
setlocal
if not exist "%~dp0analyze_code_config.bat" (
    echo ERROR: analyze_code_config.bat not found.
    exit /b 1
)
call "%~dp0analyze_code_config.bat"
if errorlevel 1 exit /b %ERRORLEVEL%
pushd "%~dp0.."
if errorlevel 1 exit /b %ERRORLEVEL%

if /i "%~1"=="changed" (
    "%CLI_ANALYZER_PATH%\venv\Scripts\python.exe" "%CLI_ANALYZER_PATH%\main.py" --language %LANGUAGE% --path "." --only-changed --fail-on-warnings --verbosity minimal --output "code_analysis_results" --rules "code_analysis_rules.json"
) else (
    "%CLI_ANALYZER_PATH%\venv\Scripts\python.exe" "%CLI_ANALYZER_PATH%\main.py" --language %LANGUAGE% --path "." --verbosity minimal --output "code_analysis_results" --maxamountoferrors 50 --rules "code_analysis_rules.json"
)
set RC=%ERRORLEVEL%

popd
exit /b %RC%

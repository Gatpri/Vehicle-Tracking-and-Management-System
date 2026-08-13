@echo off
echo ========================================
echo LLM Sentiment Analysis Setup Script
echo ========================================
echo.

REM Check Python installation
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo ✅ Python is installed

REM Install dependencies
echo.
echo Installing LLM dependencies...
pip install -r requirements.txt

if errorlevel 1 (
    echo ❌ Failed to install dependencies
    echo.
    echo Manual installation steps:
    echo   1. pip install google-generativeai
    echo   2. pip install mistralai
    echo   3. pip install starlette uvicorn
    pause
    exit /b 1
)

echo ✅ Dependencies installed successfully

REM Create environment file if it doesn't exist
if not exist ".env" (
    echo.
    echo Creating .env file from template...
    copy .env.example .env
    echo ⚠️  Please edit .env file and add your API keys:
    echo    - GEMINI_API_KEY from https://makersuite.google.com/app/apikey
    echo    - MISTRAL_API_KEY from https://console.mistral.ai/api-keys/
    echo.
) else (
    echo.
    echo ✅ .env file already exists
)

REM Test the setup
echo.
echo Testing LLM sentiment module...
python test_llm_sentiment.py

if errorlevel 1 (
    echo.
    echo ⚠️  Test completed with warnings/errors
    echo Check API keys in .env file
)

echo.
echo ========================================
echo SETUP COMPLETE
echo ========================================
echo.
echo Next steps:
echo 1. Edit .env file with your API keys
echo 2. Start the ANPR service: python server.py
echo 3. Test the API endpoint with test_llm_sentiment.py
echo 4. Run backfill for existing reviews (optional)
echo.
echo For detailed instructions, see README-LLM-SENTIMENT.md
echo.
pause
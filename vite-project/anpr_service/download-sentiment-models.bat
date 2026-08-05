@echo off
REM Double-click to install the libraries and download the sentiment models.
REM Needs a network connection the first time only — after this the models load
REM from the local cache and the service works offline.
title Downloading sentiment models
cd /d "%~dp0"

echo Installing transformers and huggingface_hub...
REM markupsafe is pinned: 3.0.2 ships a binary that segfaults on import here,
REM which surfaces confusingly as `import transformers` crashing.
python -m pip install transformers huggingface_hub "markupsafe>=3.0.3"
if errorlevel 1 (
  echo.
  echo === Install failed ===
  echo Check the error above. If it mentions building a Rust extension,
  echo the package has no wheel for this Python version.
  pause
  exit /b 1
)

echo.
echo Downloading models (about 1GB)...
python download_sentiment_models.py

echo.
pause

@echo off
REM Quick Start Script for Docker Compose
REM This script provides an easy way to start the project

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   ANPR Service - Docker Compose Launcher
echo ============================================
echo.

REM Check if Docker is installed
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not in PATH
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM Check if Docker is running
docker info >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Docker daemon is not running
    echo Please start Docker Desktop
    pause
    exit /b 1
)

echo ✓ Docker is installed and running
echo.

REM Check if .env file exists
if not exist .env (
    echo WARNING: .env file not found
    echo Creating .env from .env.example template...
    copy .env.example .env
    echo ✓ Created .env file
    echo.
    echo IMPORTANT: Edit .env and fill in the blank values, including:
    echo   - JWT_SECRET  ^(generate: openssl rand -hex 32^)
    echo   - GEMINI_API_KEY
    echo   - FIREBASE_PRIVATE_KEY
    echo.
    pause
)

echo Available commands:
echo.
echo   1 - Start all services (build if needed)
echo   2 - Start services in background
echo   3 - View logs
echo   4 - Stop all services
echo   5 - Restart services
echo   6 - Clean up everything (delete volumes)
echo   7 - Build images
echo   8 - View service status
echo   0 - Exit
echo.

set /p choice="Enter your choice (0-8): "

if "%choice%"=="1" (
    echo.
    echo Building and starting services...
    docker-compose up --build
    goto end
)

if "%choice%"=="2" (
    echo.
    echo Starting services in background...
    docker-compose up -d
    echo.
    echo Services started!
    echo.
    echo Access the application at:
    echo   - Frontend: http://localhost
    echo   - Backend: http://localhost:3000
    echo   - ANPR Service: http://localhost:8000
    echo.
    echo View logs with: docker-compose logs -f
    goto end
)

if "%choice%"=="3" (
    echo.
    docker-compose logs -f
    goto end
)

if "%choice%"=="4" (
    echo.
    echo Stopping all services...
    docker-compose down
    echo Services stopped!
    goto end
)

if "%choice%"=="5" (
    echo.
    echo Restarting services...
    docker-compose restart
    echo Services restarted!
    goto end
)

if "%choice%"=="6" (
    echo.
    echo WARNING: This will delete all volumes and data!
    set /p confirm="Are you sure? (yes/no): "
    if /i "%confirm%"=="yes" (
        docker-compose down -v
        echo Everything cleaned up!
    ) else (
        echo Cancelled.
    )
    goto end
)

if "%choice%"=="7" (
    echo.
    echo Building images...
    docker-compose build --no-cache
    echo Build complete!
    goto end
)

if "%choice%"=="8" (
    echo.
    docker-compose ps
    echo.
    goto end
)

if "%choice%"=="0" (
    echo Exiting...
    goto end
)

echo Invalid choice. Exiting...

:end
echo.
pause

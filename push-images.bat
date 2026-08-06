@echo off
setlocal
if "%~1"=="" (
  echo Usage: push-images.bat ^<dockerhub-username^> [image-tag]
  echo Example: push-images.bat mydockerhub 1.0.0
  pause
  exit /b 1
)

set DOCKERHUB_USERNAME=%~1
set APP_IMAGE_TAG=%~2
if "%APP_IMAGE_TAG%"=="" set APP_IMAGE_TAG=latest

echo Building backend image...
docker build -f backend/Dockerfile -t %DOCKERHUB_USERNAME%/brand-intelligence-backend:%APP_IMAGE_TAG% .
if errorlevel 1 goto :fail

echo Building frontend image...
docker build -f react-ui/Dockerfile -t %DOCKERHUB_USERNAME%/brand-intelligence-frontend:%APP_IMAGE_TAG% ./react-ui
if errorlevel 1 goto :fail

echo Pushing backend image...
docker push %DOCKERHUB_USERNAME%/brand-intelligence-backend:%APP_IMAGE_TAG%
if errorlevel 1 goto :fail

echo Pushing frontend image...
docker push %DOCKERHUB_USERNAME%/brand-intelligence-frontend:%APP_IMAGE_TAG%
if errorlevel 1 goto :fail

echo.
echo Done.
echo Backend image: %DOCKERHUB_USERNAME%/brand-intelligence-backend:%APP_IMAGE_TAG%
echo Frontend image: %DOCKERHUB_USERNAME%/brand-intelligence-frontend:%APP_IMAGE_TAG%
pause
exit /b 0

:fail
echo.
echo Build or push failed.
pause
exit /b 1

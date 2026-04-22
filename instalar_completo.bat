@echo off
echo ========================================
echo    INSTALACIÓN COMPLETA POS MASTER
echo ========================================
echo.

echo [Paso 1/7] Creando estructura de carpetas...
if not exist "public" mkdir public
if not exist "uploads" mkdir uploads
if not exist "config" mkdir config
if not exist "pedidos" mkdir pedidos
if not exist "backups" mkdir backups
if not exist "logs" mkdir logs
echo ✅ Carpetas creadas

echo.
echo [Paso 2/7] Limpiando instalaciones anteriores...
if exist "node_modules" rmdir /s /q node_modules
if exist "package-lock.json" del package-lock.json
echo ✅ Limpieza completada

echo.
echo [Paso 3/7] Inicializando npm...
call npm init -y
echo ✅ npm inicializado

echo.
echo [Paso 4/7] Instalando Express...
call npm install express@4.18.2
if %errorlevel% neq 0 (
    echo ❌ Error instalando Express
    pause
    exit /b 1
)
echo ✅ Express instalado

echo.
echo [Paso 5/7] Instalando Multer...
call npm install multer@1.4.5-lts.1
if %errorlevel% neq 0 (
    echo ❌ Error instalando Multer
    pause
    exit /b 1
)
echo ✅ Multer instalado

echo.
echo [Paso 6/7] Instalando Nodemon...
call npm install --save-dev nodemon@3.0.1
if %errorlevel% neq 0 (
    echo ❌ Error instalando Nodemon
    pause
    exit /b 1
)
echo ✅ Nodemon instalado

echo.
echo [Paso 7/7] Actualizando package.json...
(
echo {
echo   "name": "pos-master",
echo   "version": "1.0.0",
echo   "description": "Sistema POS Master",
echo   "main": "server.js",
echo   "scripts": {
echo     "start": "node server.js",
echo     "dev": "nodemon server.js"
echo   },
echo   "dependencies": {
echo     "express": "^4.18.2",
echo     "multer": "^1.4.5-lts.1"
echo   },
echo   "devDependencies": {
echo     "nodemon": "^3.0.1"
echo   }
echo }
) > package_temp.json
move /y package_temp.json package.json > nul
echo ✅ package.json actualizado

echo.
echo ========================================
echo    ✅ INSTALACIÓN COMPLETADA CON ÉXITO
echo ========================================
echo.
echo Estructura creada:
echo   ✅ server.js
echo   ✅ package.json
echo   ✅ node_modules\
echo   ✅ public\
echo   ✅ uploads\
echo   ✅ config\
echo   ✅ pedidos\
echo   ✅ backups\
echo   ✅ logs\
echo.
echo Para iniciar el servidor:
echo   npm run dev     (desarrollo con autorecarga)
echo   npm start       (producción)
echo   node server.js  (directo)
echo.
echo ========================================
pause
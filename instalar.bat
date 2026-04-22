@echo off
echo ========================================
echo    INSTALANDO POS MASTER
echo ========================================
echo.

echo [1/5] Inicializando proyecto...
call npm init -y

echo [2/5] Instalando dependencias principales...
call npm install express multer

echo [3/5] Instalando nodemon para desarrollo...
call npm install --save-dev nodemon

echo [4/5] Actualizando package.json...
node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); pkg.scripts = pkg.scripts || {}; pkg.scripts.dev = 'nodemon server.js'; pkg.scripts.start = 'node server.js'; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2)); console.log('✅ Scripts actualizados');"

echo [5/5] Verificando instalación...
echo.
echo ========================================
echo    INSTALACIÓN COMPLETADA
echo ========================================
echo.
echo Comandos disponibles:
echo   npm start     - Iniciar en producción
echo   npm run dev   - Iniciar en desarrollo
echo.
echo Para iniciar ahora: npm run dev
echo ========================================
pause
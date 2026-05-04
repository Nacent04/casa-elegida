// ============================================
// SERVER.JS - CASA ELEGIDA (Adaptado a JSON)
// ============================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const archiver = require('archiver');
const unzipper = require('unzipper');
const crypto = require('crypto');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'casa-elegida-secret-key-2024';
const BACKUP_DIR = path.join(__dirname, 'backups');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const CONFIG_DIR = path.join(__dirname, 'config');
const DATA_DIR = __dirname; // Los JSON están en la raíz

// ============================================
// CREAR DIRECTORIOS
// ============================================

[BACKUP_DIR, UPLOADS_DIR, CONFIG_DIR, path.join(BACKUP_DIR, 'temp')].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Configuración de multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const backupStorage = multer.diskStorage({
    destination: path.join(BACKUP_DIR, 'temp'),
    filename: (req, file, cb) => cb(null, 'restore_' + Date.now() + path.extname(file.originalname))
});
const uploadBackup = multer({ storage: backupStorage, limits: { fileSize: 500 * 1024 * 1024 } });

// ============================================
// FUNCIONES DE LECTURA/ESCRITURA DE JSON
// ============================================

function leerJSON(archivo) {
    try {
        const filePath = path.join(DATA_DIR, archivo);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify([], null, 2));
            return [];
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error leyendo ${archivo}:`, error);
        return [];
    }
}

function guardarJSON(archivo, data) {
    try {
        const filePath = path.join(DATA_DIR, archivo);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error guardando ${archivo}:`, error);
        return false;
    }
}

// ============================================
// MIDDLEWARE DE AUTENTICACIÓN
// ============================================

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

function adminOnly(req, res, next) {
    if (req.admin?.rol !== 'admin') {
        return res.status(403).json({ error: 'Requiere permisos de administrador' });
    }
    next();
}

async function logAccion(admin, accion, detalles = '') {
    try {
        const logs = leerJSON('logs.json') || [];
        const fecha = new Date();
        logs.unshift({
            fecha,
            fechaLocal: fecha.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
            admin,
            accion,
            detalles
        });
        guardarJSON('logs.json', logs.slice(0, 5000));
    } catch (e) {
        console.error('Error guardando log:', e);
    }
}

function fmt(monto) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(monto);
}

// ============================================
// RUTAS DE AUTENTICACIÓN
// ============================================

app.post('/admin/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;
        const usuarios = leerJSON('usuarios.json');
        const perfil = usuarios.find(u => u.usuario === usuario && u.activo !== false);
        
        if (!perfil) {
            return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
        }
        
        const passwordValida = await bcrypt.compare(password, perfil.password);
        if (!passwordValida) {
            return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
        }
        
        const token = jwt.sign(
            { id: perfil.id, usuario: perfil.usuario, nombre: perfil.nombre, rol: perfil.rol, permisos: perfil.permisos || [] },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        await logAccion(perfil.nombre, 'Inicio de sesión');
        
        res.json({ success: true, token, perfil });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS DE PRODUCTOS
// ============================================

app.post('/listar', async (req, res) => {
    try {
        const productos = leerJSON('productos.json');
        res.json({ lista: productos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/guardar-producto', authMiddleware, async (req, res) => {
    try {
        const productoData = req.body;
        let productos = leerJSON('productos.json');
        
        const index = productos.findIndex(p => p.id === productoData.id);
        if (index >= 0) {
            productos[index] = { ...productos[index], ...productoData };
        } else {
            productos.push(productoData);
        }
        
        guardarJSON('productos.json', productos);
        await logAccion(req.admin.nombre, 'Guardar producto', productoData.nombre);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/eliminar-producto', authMiddleware, async (req, res) => {
    try {
        const { id } = req.body;
        let productos = leerJSON('productos.json');
        productos = productos.filter(p => p.id !== id);
        guardarJSON('productos.json', productos);
        await logAccion(req.admin.nombre, 'Eliminar producto', `ID: ${id}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/verificar-stock', async (req, res) => {
    try {
        const { productoId, varianteNombre } = req.body;
        const productos = leerJSON('productos.json');
        const producto = productos.find(p => p.id == productoId);
        if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
        
        const variante = producto.variantes?.find(v => v.nombre === varianteNombre);
        res.json({ stock: variante?.stock || 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/stock-bajo', authMiddleware, async (req, res) => {
    try {
        const { minimo = 5 } = req.body;
        const productos = leerJSON('productos.json');
        const stockBajo = [];
        
        productos.forEach(p => {
            (p.variantes || []).forEach(v => {
                if (v.stock <= minimo) {
                    stockBajo.push({ producto: p.nombre, variante: v.nombre, stock: v.stock });
                }
            });
        });
        
        res.json({ stockBajo });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/subir-imagen', authMiddleware, upload.single('foto'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
        const url = '/uploads/' + req.file.filename;
        res.json({ url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/importar-productos', authMiddleware, async (req, res) => {
    try {
        const { productos } = req.body;
        let productosActuales = leerJSON('productos.json');
        let importados = 0;
        
        for (let prod of productos) {
            prod.id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
            if (!prod.variantes?.length) prod.variantes = [{ nombre: 'Única', stock: 0, foto: '' }];
            productosActuales.push(prod);
            importados++;
        }
        
        guardarJSON('productos.json', productosActuales);
        await logAccion(req.admin.nombre, 'Importar productos', `${importados} productos`);
        res.json({ success: true, importados });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// RUTAS DE CATEGORÍAS
// ============================================

app.post('/listar-categorias', async (req, res) => {
    try {
        const categorias = leerJSON('categorias.json');
        res.json({ lista: categorias });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/guardar-categoria', authMiddleware, async (req, res) => {
    try {
        const catData = req.body;
        let categorias = leerJSON('categorias.json');
        const index = categorias.findIndex(c => c.id === catData.id);
        if (index >= 0) {
            categorias[index] = catData;
        } else {
            categorias.push(catData);
        }
        guardarJSON('categorias.json', categorias);
        await logAccion(req.admin.nombre, 'Guardar categoría', catData.nombre);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/eliminar-categoria', authMiddleware, async (req, res) => {
    try {
        let categorias = leerJSON('categorias.json');
        categorias = categorias.filter(c => c.id !== req.body.id);
        guardarJSON('categorias.json', categorias);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// RUTAS DE VENTAS
// ============================================

app.post('/confirmar-venta', authMiddleware, async (req, res) => {
    try {
        const { carrito, pagos, total, logistica, cliente, mayoristaConfig } = req.body;
        const ventaId = 'V-' + Date.now().toString(36).toUpperCase();
        const fecha = new Date();
        
        const venta = {
            id: ventaId,
            fecha: fecha.toISOString(),
            fechaLocal: fecha.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
            items: carrito.map(i => ({
                pId: i.pId,
                pNom: i.pNom,
                vNom: i.vNom,
                vFoto: i.vFoto || '',
                precio: i.precio,
                cant: i.cant
            })),
            pago: {
                total,
                metodo: pagos?.[0]?.metodo || 'efectivo',
                pagos: pagos || [{ metodo: 'efectivo', monto: total }]
            },
            cliente: cliente || { nombre: 'Mostrador' },
            logistica: logistica || 'local',
            vendedor: req.admin.nombre,
            mayoristaAplicado: mayoristaConfig?.habilitado || false
        };
        
        // Guardar venta
        let ventas = leerJSON('ventas.json');
        ventas.unshift(venta);
        guardarJSON('ventas.json', ventas);
        
        // Actualizar stock
        let productos = leerJSON('productos.json');
        for (let item of carrito) {
            const producto = productos.find(p => p.id == item.pId);
            if (producto) {
                const variante = producto.variantes?.find(v => v.nombre === item.vNom);
                if (variante) {
                    variante.stock = Math.max(0, variante.stock - item.cant);
                }
            }
        }
        guardarJSON('productos.json', productos);
        
        await logAccion(req.admin.nombre, 'Venta realizada', `${ventaId}`);
        
        res.json({ success: true, ventaId });
    } catch (error) {
        console.error('Error en venta:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/listar-ventas', authMiddleware, async (req, res) => {
    try {
        const ventas = leerJSON('ventas.json');
        res.json({ lista: ventas.slice(0, 500) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// RUTAS DE PEDIDOS
// ============================================

app.post('/tienda/listar-pedidos', authMiddleware, async (req, res) => {
    try {
        const pedidos = leerJSON('pedidos.json');
        res.json({ lista: pedidos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/tienda/confirmar-pedido', authMiddleware, async (req, res) => {
    try {
        let pedidos = leerJSON('pedidos.json');
        const pedido = pedidos.find(p => p.id === req.body.pedidoId);
        if (pedido) {
            pedido.estado = 'confirmado';
            guardarJSON('pedidos.json', pedidos);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// RUTAS DE PERFILES
// ============================================

app.post('/admin/perfiles', authMiddleware, adminOnly, async (req, res) => {
    try {
        const usuarios = leerJSON('usuarios.json');
        const perfiles = usuarios.map(u => ({ ...u, password: undefined }));
        res.json({ lista: perfiles });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/crear-perfil', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { adminPassword, usuario, password, nombre, permisos } = req.body;
        
        // Verificar contraseña del admin
        const usuarios = leerJSON('usuarios.json');
        const admin = usuarios.find(u => u.usuario === req.admin.usuario);
        const passwordValida = await bcrypt.compare(adminPassword, admin.password);
        if (!passwordValida) return res.status(403).json({ success: false, error: 'Contraseña de admin incorrecta' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        usuarios.push({
            id: 'P-' + Date.now(),
            nombre,
            usuario,
            password: hashedPassword,
            permisos: permisos || [],
            rol: 'vendedor',
            activo: true
        });
        
        guardarJSON('usuarios.json', usuarios);
        await logAccion(req.admin.nombre, 'Crear perfil', nombre);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/admin/editar-perfil', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { id, activo } = req.body;
        let usuarios = leerJSON('usuarios.json');
        const usuario = usuarios.find(u => u.id === id);
        if (usuario && usuario.rol !== 'admin') {
            usuario.activo = activo;
            guardarJSON('usuarios.json', usuarios);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/cambiar-password', authMiddleware, async (req, res) => {
    try {
        const { passwordActual, passwordNueva } = req.body;
        let usuarios = leerJSON('usuarios.json');
        const usuario = usuarios.find(u => u.usuario === req.admin.usuario);
        
        const passwordValida = await bcrypt.compare(passwordActual, usuario.password);
        if (!passwordValida) return res.status(403).json({ success: false, error: 'Contraseña actual incorrecta' });
        
        usuario.password = await bcrypt.hash(passwordNueva, 10);
        guardarJSON('usuarios.json', usuarios);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS DE NOTIFICACIONES
// ============================================

app.post('/notificaciones', authMiddleware, async (req, res) => {
    try {
        const notificaciones = leerJSON('notificaciones.json');
        res.json({ lista: notificaciones.slice(0, 50) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/notificaciones/leer', authMiddleware, async (req, res) => {
    try {
        let notificaciones = leerJSON('notificaciones.json');
        const notif = notificaciones.find(n => n.id === req.body.id);
        if (notif) {
            notif.leida = true;
            guardarJSON('notificaciones.json', notificaciones);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/notificaciones/leer-todas', authMiddleware, async (req, res) => {
    try {
        let notificaciones = leerJSON('notificaciones.json');
        notificaciones.forEach(n => n.leida = true);
        guardarJSON('notificaciones.json', notificaciones);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// RUTAS DE MÉTODOS DE ENVÍO
// ============================================

app.post('/listar-metodos-envio', async (req, res) => {
    try {
        const metodos = leerJSON('metodos-envio.json');
        res.json({ lista: metodos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/guardar-metodos-envio', authMiddleware, async (req, res) => {
    try {
        guardarJSON('metodos-envio.json', req.body.lista);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// RUTAS DE LOGS
// ============================================

app.post('/logs/admin', authMiddleware, async (req, res) => {
    try {
        const { filtro, desde, hasta } = req.body;
        let logs = leerJSON('logs.json') || [];
        
        if (filtro) {
            logs = logs.filter(l => 
                (l.admin && l.admin.toLowerCase().includes(filtro.toLowerCase())) ||
                (l.accion && l.accion.toLowerCase().includes(filtro.toLowerCase()))
            );
        }
        
        res.json({ lista: logs.slice(0, 500) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SISTEMA DE BACKUP TOTAL (Adaptado a JSON)
// ============================================

app.post('/admin/backup/crear-total', authMiddleware, async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupId = `backup_total_${timestamp}`;
        const backupPath = path.join(BACKUP_DIR, backupId);
        
        fs.mkdirSync(backupPath, { recursive: true });
        
        console.log('📦 Iniciando backup total:', backupId);
        
        // Recopilar TODOS los datos de archivos JSON
        const datos = {
            metadata: {
                id: backupId,
                fecha: new Date().toISOString(),
                version: '2.0',
                tipo: 'total',
                sistema: 'Casa Elegida'
            },
            productos: leerJSON('productos.json'),
            categorias: leerJSON('categorias.json'),
            ventas: leerJSON('ventas.json'),
            pedidos: leerJSON('pedidos.json'),
            usuarios: leerJSON('usuarios.json'),
            notificaciones: leerJSON('notificaciones.json'),
            metodosEnvio: leerJSON('metodos-envio.json'),
            sucursales: leerJSON('sucursales.json'),
            logs: (leerJSON('logs.json') || []).slice(0, 5000)
        };
        
        // Estadísticas
        const stats = {
            productos: datos.productos.length,
            ventas: datos.ventas.length,
            usuarios: datos.usuarios.length,
            pedidos: datos.pedidos.length,
            imagenes: 0,
            totalRegistros: 0
        };
        
        Object.values(datos).forEach(val => {
            if (Array.isArray(val)) stats.totalRegistros += val.length;
        });
        
        // Guardar datos
        fs.writeFileSync(path.join(backupPath, 'data.json'), JSON.stringify(datos, null, 2));
        
        // Copiar imágenes
        const imagenesDir = path.join(backupPath, 'imagenes');
        fs.mkdirSync(imagenesDir, { recursive: true });
        
        if (fs.existsSync(UPLOADS_DIR)) {
            const copiarRecursivo = (src, dest) => {
                const entries = fs.readdirSync(src, { withFileTypes: true });
                for (let entry of entries) {
                    const srcPath = path.join(src, entry.name);
                    const destPath = path.join(dest, entry.name);
                    if (entry.isDirectory()) {
                        fs.mkdirSync(destPath, { recursive: true });
                        copiarRecursivo(srcPath, destPath);
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                        stats.imagenes++;
                    }
                }
            };
            copiarRecursivo(UPLOADS_DIR, imagenesDir);
        }
        
        // Guardar metadata con stats
        datos.metadata.stats = stats;
        fs.writeFileSync(path.join(backupPath, 'data.json'), JSON.stringify(datos, null, 2));
        
        // Crear ZIP
        const zipFilename = `${backupId}.backup`;
        const zipPath = path.join(BACKUP_DIR, zipFilename);
        
        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            archive.directory(backupPath, backupId);
            archive.finalize();
        });
        
        // Limpiar temp
        fs.rmSync(backupPath, { recursive: true, force: true });
        
        const finalStats = fs.statSync(zipPath);
        
        await logAccion(req.admin.nombre, 'Backup creado', `${stats.productos} prod, ${stats.ventas} ventas`);
        
        res.json({
            success: true,
            id: backupId,
            filename: zipFilename,
            downloadUrl: `/admin/backup/descargar-archivo/${zipFilename}`,
            stats,
            tamano: (finalStats.size / 1024 / 1024).toFixed(2)
        });
        
    } catch (error) {
        console.error('❌ Error creando backup:', error);
        res.status(500).json({ error: 'Error al crear backup: ' + error.message });
    }
});

app.post('/admin/backup/historial-total', authMiddleware, async (req, res) => {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return res.json({ backups: [], autoBackup: null });
        
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.backup') || f.endsWith('.zip'))
            .map(f => {
                const filePath = path.join(BACKUP_DIR, f);
                const stats = fs.statSync(filePath);
                return {
                    id: f.replace('.backup', '').replace('.zip', ''),
                    nombre: f,
                    fecha: stats.mtime.toISOString(),
                    tamano: (stats.size / 1024 / 1024).toFixed(2),
                    automatico: f.includes('auto_'),
                    encriptado: f.includes('enc_'),
                    stats: { productos: '?', ventas: '?' }
                };
            })
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        
        res.json({ backups: files });
    } catch (error) {
        res.json({ backups: [] });
    }
});

app.get('/admin/backup/descargar-archivo/:filename', authMiddleware, (req, res) => {
    const filePath = path.join(BACKUP_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'Archivo no encontrado' });
    }
});

app.post('/admin/backup/descargar-total', authMiddleware, (req, res) => {
    const { id } = req.body;
    for (let ext of ['.backup', '.zip']) {
        const filePath = path.join(BACKUP_DIR, id + ext);
        if (fs.existsSync(filePath)) {
            return res.json({ url: `/admin/backup/descargar-archivo/${id}${ext}` });
        }
    }
    res.status(404).json({ error: 'Backup no encontrado' });
});

app.post('/admin/backup/eliminar-total', authMiddleware, async (req, res) => {
    try {
        const { id } = req.body;
        for (let ext of ['.backup', '.zip']) {
            const filePath = path.join(BACKUP_DIR, id + ext);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return res.json({ success: true });
            }
        }
        res.status(404).json({ error: 'Backup no encontrado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/backup/restaurar-desde-archivo', authMiddleware, uploadBackup.single('backup'), async (req, res) => {
    const { password } = req.body;
    
    const usuarios = leerJSON('usuarios.json');
    const admin = usuarios.find(u => u.usuario === req.admin.usuario);
    const passwordValida = await bcrypt.compare(password, admin.password);
    if (!passwordValida) return res.status(403).json({ error: 'Contraseña incorrecta' });
    
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
    
    try {
        const tempDir = path.join(BACKUP_DIR, 'temp_restore_' + Date.now());
        fs.mkdirSync(tempDir, { recursive: true });
        
        await fs.createReadStream(req.file.path)
            .pipe(unzipper.Extract({ path: tempDir }))
            .promise();
        
        let dataDir = tempDir;
        const files = fs.readdirSync(tempDir);
        for (let file of files) {
            const fullPath = path.join(tempDir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                dataDir = fullPath;
                break;
            }
        }
        
        const dataPath = path.join(dataDir, 'data.json');
        if (!fs.existsSync(dataPath)) throw new Error('Archivo de datos no encontrado');
        
        const backup = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        
        // Restaurar archivos JSON
        if (backup.productos) guardarJSON('productos.json', backup.productos);
        if (backup.categorias) guardarJSON('categorias.json', backup.categorias);
        if (backup.ventas) guardarJSON('ventas.json', backup.ventas);
        if (backup.pedidos) guardarJSON('pedidos.json', backup.pedidos);
        if (backup.notificaciones) guardarJSON('notificaciones.json', backup.notificaciones);
        if (backup.metodosEnvio) guardarJSON('metodos-envio.json', backup.metodosEnvio);
        
        // Mantener admin principal
        if (backup.usuarios) {
            const adminPrincipal = usuarios.find(u => u.rol === 'admin');
            const otrosUsuarios = backup.usuarios.filter(u => u.rol !== 'admin' || u.usuario === adminPrincipal?.usuario);
            guardarJSON('usuarios.json', otrosUsuarios);
        }
        
        // Restaurar imágenes
        const imagenesBackup = path.join(dataDir, 'imagenes');
        if (fs.existsSync(imagenesBackup)) {
            if (fs.existsSync(UPLOADS_DIR)) {
                fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
            }
            fs.mkdirSync(UPLOADS_DIR, { recursive: true });
            
            const copiarRecursivo = (src, dest) => {
                const entries = fs.readdirSync(src, { withFileTypes: true });
                for (let entry of entries) {
                    const srcPath = path.join(src, entry.name);
                    const destPath = path.join(dest, entry.name);
                    if (entry.isDirectory()) {
                        fs.mkdirSync(destPath, { recursive: true });
                        copiarRecursivo(srcPath, destPath);
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                    }
                }
            };
            copiarRecursivo(imagenesBackup, UPLOADS_DIR);
        }
        
        // Limpiar
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.unlinkSync(req.file.path);
        
        const stats = {
            productos: backup.productos?.length || 0,
            ventas: backup.ventas?.length || 0,
            imagenes: backup.metadata?.stats?.imagenes || 0
        };
        
        await logAccion(req.admin.nombre, 'Restauración del sistema');
        
        res.json({ success: true, stats });
        
    } catch (error) {
        res.status(500).json({ error: 'Error al restaurar: ' + error.message });
    }
});

// ============================================
// RUTAS DE TIENDA ONLINE
// ============================================

app.post('/tienda/listar-productos', async (req, res) => {
    try {
        const productos = leerJSON('productos.json');
        const categorias = leerJSON('categorias.json');
        res.json({ productos, categorias });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// INICIALIZACIÓN DEL SISTEMA
// ============================================

async function inicializarSistema() {
    try {
        // Crear admin por defecto
        let usuarios = leerJSON('usuarios.json');
        if (!usuarios.find(u => u.usuario === 'admin')) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            usuarios.push({
                id: 'P-admin',
                nombre: 'Administrador',
                usuario: 'admin',
                password: hashedPassword,
                rol: 'admin',
                permisos: ['ventas', 'stock', 'pedidos', 'config', 'dashboard', 'logs', 'web', 'admin'],
                activo: true
            });
            guardarJSON('usuarios.json', usuarios);
            console.log('✅ Admin creado: admin / admin123');
        }
        
        // Inicializar archivos si no existen
        const archivosIniciales = ['productos.json', 'categorias.json', 'ventas.json', 'pedidos.json', 'notificaciones.json', 'logs.json'];
        archivosIniciales.forEach(archivo => {
            if (!fs.existsSync(path.join(DATA_DIR, archivo))) {
                guardarJSON(archivo, []);
            }
        });
        
        console.log('🚀 Sistema inicializado correctamente');
    } catch (error) {
        console.error('❌ Error inicializando:', error);
    }
}

// ============================================
// INICIAR SERVIDOR
// ============================================

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/tienda', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tienda.html'));
});

app.listen(PORT, async () => {
    await inicializarSistema();
    console.log(`🏪 Casa Elegida - Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 Panel Admin: http://localhost:${PORT}/admin`);
    console.log(`🛍️ Tienda: http://localhost:${PORT}/tienda`);
    console.log(`👤 Login: admin / admin123`);
});

module.exports = app;

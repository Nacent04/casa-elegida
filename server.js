// ============================================
// SERVER.JS - CASA ELEGIDA POS MASTER (PostgreSQL)
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Pool } = require('pg');
const archiver = require('archiver');
const unzipper = require('unzipper');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'casa-elegida-secret-key-2024';
const BACKUP_DIR = path.join(__dirname, 'backups');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// ============================================
// CONEXIÓN A POSTGRESQL
// ============================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // o configuración individual:
    // user: process.env.DB_USER,
    // host: process.env.DB_HOST,
    // database: process.env.DB_NAME,
    // password: process.env.DB_PASSWORD,
    // port: process.env.DB_PORT || 5432,
});

// ============================================
// CREAR DIRECTORIOS
// ============================================

[BACKUP_DIR, UPLOADS_DIR, path.join(BACKUP_DIR, 'temp')].forEach(dir => {
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
        await pool.query(
            'INSERT INTO logs (fecha, admin, accion, detalles) VALUES (NOW(), $1, $2, $3)',
            [admin, accion, detalles]
        );
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
        
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE usuario = $1 AND activo = true',
            [usuario]
        );
        
        const perfil = result.rows[0];
        
        if (!perfil) {
            return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
        }
        
        const passwordValida = await bcrypt.compare(password, perfil.password);
        if (!passwordValida) {
            return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
        }
        
        const token = jwt.sign(
            { 
                id: perfil.id, 
                usuario: perfil.usuario, 
                nombre: perfil.nombre, 
                rol: perfil.rol, 
                permisos: perfil.permisos || [] 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        await logAccion(perfil.nombre, 'Inicio de sesión');
        
        res.json({ success: true, token, perfil });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS DE PRODUCTOS
// ============================================

app.post('/listar', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM productos ORDER BY orden ASC, fecha_creacion DESC'
        );
        res.json({ lista: result.rows });
    } catch (error) {
        console.error('Error listando productos:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/guardar-producto', authMiddleware, async (req, res) => {
    try {
        const p = req.body;
        
        // Verificar si existe
        const existe = await pool.query('SELECT id FROM productos WHERE id = $1', [p.id]);
        
        if (existe.rows.length > 0) {
            await pool.query(
                `UPDATE productos SET 
                    nombre = $1, precio = $2, precio_mayor = $3, descripcion = $4,
                    categoria_id = $5, subcategoria = $6, variantes = $7, destacado = $8
                WHERE id = $9`,
                [p.nombre, p.precio, p.precioMayor, p.descripcion, p.categoriaId, 
                 p.subcategoria, JSON.stringify(p.variantes), p.destacado, p.id]
            );
        } else {
            await pool.query(
                `INSERT INTO productos (id, nombre, precio, precio_mayor, descripcion, categoria_id, subcategoria, variantes, destacado)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [p.id, p.nombre, p.precio, p.precioMayor, p.descripcion, p.categoriaId, 
                 p.subcategoria, JSON.stringify(p.variantes), p.destacado]
            );
        }
        
        await logAccion(req.admin.nombre, 'Guardar producto', p.nombre);
        res.json({ success: true });
    } catch (error) {
        console.error('Error guardando producto:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/eliminar-producto', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM productos WHERE id = $1', [req.body.id]);
        await logAccion(req.admin.nombre, 'Eliminar producto', req.body.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/verificar-stock', async (req, res) => {
    try {
        const result = await pool.query('SELECT variantes FROM productos WHERE id = $1', [req.body.productoId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        
        const variantes = result.rows[0].variantes || [];
        const variante = variantes.find(v => v.nombre === req.body.varianteNombre);
        res.json({ stock: variante?.stock || 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/stock-bajo', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM productos');
        const stockBajo = [];
        
        result.rows.forEach(p => {
            (p.variantes || []).forEach(v => {
                if (v.stock <= (req.body.minimo || 5)) {
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
        res.json({ url: '/uploads/' + req.file.filename });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/importar-productos', authMiddleware, async (req, res) => {
    try {
        const { productos } = req.body;
        let importados = 0;
        
        for (let prod of productos) {
            prod.id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
            if (!prod.variantes?.length) prod.variantes = [{ nombre: 'Única', stock: 0, foto: '' }];
            
            await pool.query(
                `INSERT INTO productos (id, nombre, precio, precio_mayor, descripcion, categoria_id, subcategoria, variantes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [prod.id, prod.nombre, prod.precio, prod.precioMayor, prod.descripcion, 
                 prod.categoriaId, prod.subcategoria, JSON.stringify(prod.variantes)]
            );
            importados++;
        }
        
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
        const result = await pool.query('SELECT * FROM categorias ORDER BY orden ASC');
        res.json({ lista: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/guardar-categoria', authMiddleware, async (req, res) => {
    try {
        const c = req.body;
        const existe = await pool.query('SELECT id FROM categorias WHERE id = $1', [c.id]);
        
        if (existe.rows.length > 0) {
            await pool.query('UPDATE categorias SET nombre = $1, subcategorias = $2 WHERE id = $3',
                [c.nombre, JSON.stringify(c.subcategorias || []), c.id]);
        } else {
            await pool.query('INSERT INTO categorias (id, nombre, subcategorias) VALUES ($1, $2, $3)',
                [c.id, c.nombre, JSON.stringify(c.subcategorias || [])]);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/eliminar-categoria', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM categorias WHERE id = $1', [req.body.id]);
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
        
        await pool.query(
            `INSERT INTO ventas (id, fecha, items, pago, cliente, logistica, vendedor, mayorista_aplicado)
            VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)`,
            [
                ventaId,
                JSON.stringify(carrito.map(i => ({
                    pId: i.pId, pNom: i.pNom, vNom: i.vNom,
                    vFoto: i.vFoto || '', precio: i.precio, cant: i.cant
                }))),
                JSON.stringify({ total, metodo: pagos?.[0]?.metodo || 'efectivo', pagos: pagos || [] }),
                JSON.stringify(cliente || { nombre: 'Mostrador' }),
                logistica || 'local',
                req.admin.nombre,
                mayoristaConfig?.habilitado || false
            ]
        );
        
        // Actualizar stock
        for (let item of carrito) {
            const result = await pool.query('SELECT variantes FROM productos WHERE id = $1', [item.pId]);
            if (result.rows.length > 0) {
                let variantes = result.rows[0].variantes || [];
                const variante = variantes.find(v => v.nombre === item.vNom);
                if (variante) {
                    variante.stock = Math.max(0, variante.stock - item.cant);
                    await pool.query('UPDATE productos SET variantes = $1 WHERE id = $2',
                        [JSON.stringify(variantes), item.pId]);
                }
            }
        }
        
        await logAccion(req.admin.nombre, 'Venta realizada', ventaId);
        res.json({ success: true, ventaId });
    } catch (error) {
        console.error('Error en venta:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/listar-ventas', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM ventas ORDER BY fecha DESC LIMIT 500');
        res.json({ lista: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// RUTAS DE PEDIDOS
// ============================================

app.post('/tienda/listar-pedidos', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos ORDER BY fecha DESC');
        res.json({ lista: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/tienda/confirmar-pedido', authMiddleware, async (req, res) => {
    try {
        await pool.query("UPDATE pedidos SET estado = 'confirmado' WHERE id = $1", [req.body.pedidoId]);
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
        const result = await pool.query('SELECT id, nombre, usuario, rol, permisos, activo FROM usuarios');
        res.json({ lista: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/crear-perfil', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { adminPassword, usuario, password, nombre, permisos } = req.body;
        
        const adminResult = await pool.query('SELECT password FROM usuarios WHERE usuario = $1', [req.admin.usuario]);
        const passwordValida = await bcrypt.compare(adminPassword, adminResult.rows[0].password);
        if (!passwordValida) return res.status(403).json({ success: false, error: 'Contraseña de admin incorrecta' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO usuarios (id, nombre, usuario, password, rol, permisos, activo) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            ['P-' + Date.now(), nombre, usuario, hashedPassword, 'vendedor', JSON.stringify(permisos || []), true]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/admin/editar-perfil', authMiddleware, adminOnly, async (req, res) => {
    try {
        await pool.query('UPDATE usuarios SET activo = $1 WHERE id = $2 AND rol != $3',
            [req.body.activo, req.body.id, 'admin']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/cambiar-password', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT password FROM usuarios WHERE usuario = $1', [req.admin.usuario]);
        const passwordValida = await bcrypt.compare(req.body.passwordActual, result.rows[0].password);
        if (!passwordValida) return res.status(403).json({ success: false, error: 'Contraseña actual incorrecta' });
        
        const hashedPassword = await bcrypt.hash(req.body.passwordNueva, 10);
        await pool.query('UPDATE usuarios SET password = $1 WHERE usuario = $2',
            [hashedPassword, req.admin.usuario]);
        
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
        const result = await pool.query('SELECT * FROM notificaciones ORDER BY fecha DESC LIMIT 50');
        res.json({ lista: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/notificaciones/leer', authMiddleware, async (req, res) => {
    try {
        await pool.query('UPDATE notificaciones SET leida = true WHERE id = $1', [req.body.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/notificaciones/leer-todas', authMiddleware, async (req, res) => {
    try {
        await pool.query("UPDATE notificaciones SET leida = true WHERE leida = false");
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
        const { filtro } = req.body;
        let query = 'SELECT * FROM logs';
        let params = [];
        
        if (filtro) {
            query += ' WHERE admin ILIKE $1 OR accion ILIKE $1';
            params.push(`%${filtro}%`);
        }
        
        query += ' ORDER BY fecha DESC LIMIT 500';
        
        const result = await pool.query(query, params);
        res.json({ lista: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SISTEMA DE BACKUP TOTAL (PostgreSQL)
// ============================================

async function exportarTabla(nombreTabla) {
    const result = await pool.query(`SELECT * FROM ${nombreTabla}`);
    return result.rows;
}

app.post('/admin/backup/crear-total', authMiddleware, async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupId = `backup_total_${timestamp}`;
        const backupPath = path.join(BACKUP_DIR, backupId);
        
        fs.mkdirSync(backupPath, { recursive: true });
        
        console.log('📦 Iniciando backup total:', backupId);
        
        // Exportar TODAS las tablas
        const datos = {
            metadata: {
                id: backupId,
                fecha: new Date().toISOString(),
                version: '2.0',
                tipo: 'total',
                sistema: 'Casa Elegida POS Master'
            },
            productos: await exportarTabla('productos'),
            categorias: await exportarTabla('categorias'),
            ventas: await exportarTabla('ventas'),
            pedidos: await exportarTabla('pedidos'),
            usuarios: await exportarTabla('usuarios'),
            notificaciones: await exportarTabla('notificaciones'),
            logs: (await pool.query('SELECT * FROM logs ORDER BY fecha DESC LIMIT 5000')).rows,
        };
        
        const stats = {
            productos: datos.productos.length,
            ventas: datos.ventas.length,
            usuarios: datos.usuarios.length,
            pedidos: datos.pedidos.length,
            imagenes: 0,
            totalRegistros: 0
        };
        
        // Contar registros
        Object.values(datos).forEach(val => {
            if (Array.isArray(val)) stats.totalRegistros += val.length;
        });
        
        datos.metadata.stats = stats;
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
        
        // Actualizar stats finales
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
    
    try {
        // Verificar contraseña
        const adminResult = await pool.query('SELECT password FROM usuarios WHERE usuario = $1', [req.admin.usuario]);
        const passwordValida = await bcrypt.compare(password, adminResult.rows[0].password);
        if (!passwordValida) return res.status(403).json({ error: 'Contraseña incorrecta' });
        
        if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
        
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
        
        // Limpiar tablas actuales
        await pool.query('DELETE FROM productos');
        await pool.query('DELETE FROM categorias');
        await pool.query('DELETE FROM ventas');
        await pool.query('DELETE FROM pedidos');
        await pool.query('DELETE FROM notificaciones');
        
        // Restaurar datos
        if (backup.productos) {
            for (let p of backup.productos) {
                await pool.query(
                    `INSERT INTO productos (id, nombre, precio, precio_mayor, descripcion, categoria_id, subcategoria, variantes, destacado)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [p.id, p.nombre, p.precio, p.precio_mayor || p.precioMayor, p.descripcion,
                     p.categoria_id || p.categoriaId, p.subcategoria,
                     typeof p.variantes === 'string' ? p.variantes : JSON.stringify(p.variantes),
                     p.destacado]
                );
            }
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
        
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.unlinkSync(req.file.path);
        
        await logAccion(req.admin.nombre, 'Restauración del sistema');
        
        res.json({
            success: true,
            stats: {
                productos: backup.productos?.length || 0,
                ventas: backup.ventas?.length || 0,
                imagenes: backup.metadata?.stats?.imagenes || 0
            }
        });
        
    } catch (error) {
        console.error('Error restaurando:', error);
        res.status(500).json({ error: 'Error al restaurar: ' + error.message });
    }
});

// ============================================
// RUTAS DE TIENDA ONLINE
// ============================================

app.post('/tienda/listar-productos', async (req, res) => {
    try {
        const productos = await pool.query('SELECT * FROM productos ORDER BY orden ASC');
        const categorias = await pool.query('SELECT * FROM categorias ORDER BY orden ASC');
        res.json({ productos: productos.rows, categorias: categorias.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/tienda', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tienda.html'));
});

app.listen(PORT, () => {
    console.log(`🏪 Casa Elegida POS Master - Puerto ${PORT}`);
    console.log(`📊 Panel Admin: http://localhost:${PORT}/admin`);
});

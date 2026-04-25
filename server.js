require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const Database = require('better-sqlite3');
const app = express();
const PORT = process.env.PORT || 3000;

// ==================== BACKUP AUTOMÁTICO ====================
const BACKUP_FILE = './backups/data_backup.db';

function crearBackup() {
    try {
        if (fs.existsSync('./data.db')) {
            if (!fs.existsSync('./backups')) fs.mkdirSync('./backups', { recursive: true });
            fs.copyFileSync('./data.db', BACKUP_FILE);
            console.log('✅ Backup creado');
        }
    } catch(e) { console.error('Error creando backup:', e); }
}

function restaurarBackup() {
    try {
        if (fs.existsSync(BACKUP_FILE)) {
            fs.copyFileSync(BACKUP_FILE, './data.db');
            console.log('✅ Backup restaurado');
            return true;
        }
    } catch(e) { console.error('Error restaurando backup:', e); }
    return false;
}

if (fs.existsSync(BACKUP_FILE) && !fs.existsSync('./data.db')) {
    restaurarBackup();
}

// ==================== BASE DE DATOS ====================
const db = new Database('./data.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS productos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, precio REAL NOT NULL DEFAULT 0, precioMayor REAL DEFAULT 0, descripcion TEXT DEFAULT '', categoriaId INTEGER, subcategoria TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS variantes (id INTEGER PRIMARY KEY AUTOINCREMENT, productoId INTEGER NOT NULL, nombre TEXT NOT NULL, stock INTEGER DEFAULT 0, foto TEXT DEFAULT '', FOREIGN KEY (productoId) REFERENCES productos(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS categorias (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, subcategorias TEXT DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, apellido TEXT NOT NULL, email TEXT UNIQUE NOT NULL, telefono TEXT DEFAULT '', dni TEXT DEFAULT '', password TEXT, googleId TEXT, foto TEXT DEFAULT '', rol TEXT DEFAULT 'cliente', resetPin TEXT, resetPinExpires INTEGER, fechaRegistro TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS ventas (id TEXT PRIMARY KEY, fecha TEXT, fechaTimestamp INTEGER, items TEXT DEFAULT '[]', total REAL DEFAULT 0, metodoPago TEXT DEFAULT 'efectivo', logistica TEXT DEFAULT 'local', cliente TEXT DEFAULT '{}', esMayorista INTEGER DEFAULT 0, razonMayorista TEXT DEFAULT '', estado TEXT DEFAULT 'completada', origen TEXT DEFAULT 'admin', pedidoId TEXT);
    CREATE TABLE IF NOT EXISTS pedidos (id TEXT PRIMARY KEY, fecha TEXT, fechaTimestamp INTEGER, items TEXT DEFAULT '[]', total REAL DEFAULT 0, cliente TEXT DEFAULT '{}', tipoEntrega TEXT DEFAULT 'local', metodoEnvio TEXT DEFAULT '', esMayorista INTEGER DEFAULT 0, razonMayorista TEXT DEFAULT '', estado TEXT DEFAULT 'pendiente', origen TEXT DEFAULT 'tienda', pin TEXT, ventaId TEXT, usuarioId TEXT, stockDescontado INTEGER DEFAULT 1, fechaCancelado TEXT, fechaAbonado TEXT, fechaEnviado TEXT, fechaEntregado TEXT);
    CREATE TABLE IF NOT EXISTS notificaciones (id TEXT PRIMARY KEY, tipo TEXT, titulo TEXT, descripcion TEXT, fecha TEXT, leida INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS configuracion (clave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE IF NOT EXISTS metodos_envio (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS logs_admin (id TEXT PRIMARY KEY, admin TEXT, accion TEXT, detalles TEXT, ip TEXT, fecha TEXT DEFAULT (datetime('now')), fechaLocal TEXT);
    CREATE TABLE IF NOT EXISTS perfiles (id TEXT PRIMARY KEY, usuario TEXT UNIQUE NOT NULL, password TEXT NOT NULL, nombre TEXT NOT NULL, rol TEXT DEFAULT 'vendedor', permisos TEXT DEFAULT '[]', activo INTEGER DEFAULT 1, fechaCreacion TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS caja_diaria (fecha TEXT PRIMARY KEY, montoInicial REAL DEFAULT 0, abiertaPor TEXT, cerradaPor TEXT, estado TEXT DEFAULT 'cerrada', aperturaTimestamp INTEGER, cierreTimestamp INTEGER, totalVentas REAL DEFAULT 0, totalEsperado REAL DEFAULT 0, detallePagos TEXT DEFAULT '{}');
`);

// Configuración inicial
const configInicial = {
    logo: '', empresa: JSON.stringify({ nombre: "Casa Elegida", telefono: "", email: "casaelegida20@gmail.com", direccion: "" }),
    horarios: JSON.stringify({ lunesViernes: "9:00 - 13:00 y 17:00 - 20:00", sabados: "9:00 - 13:00", domingos: "Cerrado" }),
    redes: JSON.stringify({ instagram: "", facebook: "", tiktok: "", whatsapp: "" }),
    pagos: JSON.stringify({ alias: "", cbu: "", banco: "", titular: "" }),
    mayorista: JSON.stringify({ habilitado: false, modo: "cantidad", valorCantidad: 3, valorMonto: 80000 }),
    tienda: JSON.stringify({ habilitada: true, titulo: "Casa Elegida", mensajeBienvenida: "Calidad y confort", retiroLocal: true }),
    diseno: JSON.stringify({ colorPrimario: "#1a1a1a", colorSecundario: "#c9a96e", colorFondo: "#fafafa", colorTexto: "#1a1a1a" }),
    registroObligatorio: 'true',
    heroConfig: JSON.stringify({ titulo: "Casa Elegida", subtitulo: "Blanquería premium", badge: "✦ Precios especiales" }),
    seccionesDestacadas: JSON.stringify([{ id: "dest-1", titulo: "Novedades", tipo: "categoria", valor: "Toallones", limite: 4 }])
};
const insertConfig = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
for (const [k, v] of Object.entries(configInicial)) insertConfig.run(k, v);

['Via Cargo', 'Correo Argentino', 'Andreani', 'Moto Mensajería'].forEach(m => db.prepare('INSERT OR IGNORE INTO metodos_envio (nombre) VALUES (?)').run(m));

if (!db.prepare('SELECT id FROM perfiles WHERE usuario = ?').get('admin')) {
    db.prepare('INSERT INTO perfiles (id, usuario, password, nombre, rol, permisos) VALUES (?, ?, ?, ?, ?, ?)')
      .run('PERF-' + Date.now(), 'admin', bcrypt.hashSync('NacentLion03-04-04', 10), 'Administrador Principal', 'admin', '[]');
}

function getConfig() { const rows = db.prepare('SELECT clave, valor FROM configuracion').all(); const c = {}; rows.forEach(r => { try { c[r.clave] = JSON.parse(r.valor); } catch(e) { c[r.clave] = r.valor; } }); return c; }
function setConfig(k, v) { db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)').run(k, typeof v === 'string' ? v : JSON.stringify(v)); }
function getEmpresa() { const c = getConfig(); return typeof c.empresa === 'string' ? JSON.parse(c.empresa) : (c.empresa || { nombre: 'Casa Elegida' }); }
function logActividad(admin, accion, detalles, req) { try { db.prepare('INSERT INTO logs_admin (id, admin, accion, detalles, ip, fecha, fechaLocal) VALUES (?,?,?,?,?,?,?)').run('LOG-' + Date.now(), admin || 'Sistema', accion, String(detalles).substring(0, 200), req?.ip || 'localhost', new Date().toISOString(), new Date().toLocaleString('es-AR')); } catch(e) {} }

cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
const JWT_SECRET = process.env.JWT_SECRET; const SESSION_SECRET = process.env.SESSION_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID; const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });

['./uploads', './public', './backups'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
const storage = multer.diskStorage({ destination: (req, f, cb) => cb(null, './uploads/'), filename: (req, f, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(f.originalname)) });
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, f, cb) => { const a = /jpeg|jpg|png|gif|webp/; cb(null, a.test(path.extname(f.originalname).toLowerCase()) && a.test(f.mimetype)); } });

app.use(express.json({ limit: '50mb' })); app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { maxAge: 24 * 60 * 60 * 1000 } }));
app.use(passport.initialize()); app.use(passport.session());
app.use('/uploads', express.static('uploads')); app.use(express.static('public'));

passport.use(new GoogleStrategy({ clientID: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, callbackURL: '/auth/google/callback' },
    async (accessToken, refreshToken, profile, done) => {
        try { let u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(profile.emails[0].value); if (!u) { const id = 'USR-' + Date.now(); db.prepare('INSERT INTO usuarios (id, nombre, apellido, email, googleId, foto, rol) VALUES (?,?,?,?,?,?,?)').run(id, profile.name.givenName||'', profile.name.familyName||'', profile.emails[0].value, profile.id, profile.photos?.[0]?.value||'', 'cliente'); u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id); } return done(null, u); } catch(e) { return done(e, null); } }));
passport.serializeUser((u, d) => d(null, u.id));
passport.deserializeUser((id, d) => d(null, db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) || null));

const authMiddleware = (req, res, next) => { const t = req.headers.authorization?.replace('Bearer ', ''); if (!t) return res.status(401).json({ error: 'No autorizado' }); try { req.usuario = jwt.verify(t, JWT_SECRET); next(); } catch(e) { res.status(401).json({ error: 'Token inválido' }); } };
const adminMiddleware = (permiso = null) => (req, res, next) => { const t = req.headers.authorization?.replace('Bearer ', ''); if (!t) return res.status(401).json({ error: 'No autorizado' }); try { const d = jwt.verify(t, JWT_SECRET); if (d.tipo !== 'admin') return res.status(401).json({ error: 'No autorizado' }); if (d.rol === 'admin') { req.admin = d; return next(); } if (permiso && !d.permisos.includes(permiso)) return res.status(403).json({ error: 'Sin permiso' }); req.admin = d; next(); } catch(e) { res.status(401).json({ error: 'Token inválido' }); } };
const generarPIN = () => Math.floor(1000 + Math.random() * 9000).toString();
function crearNotificacion(tipo, titulo, desc) { db.prepare("INSERT INTO notificaciones (id, tipo, titulo, descripcion, fecha, leida) VALUES (?,?,?,?,datetime('now'),0)").run('NOTIF-' + Date.now(), tipo, titulo, desc); }
async function enviarEmail(dest, asunto, html) { if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return false; try { await transporter.sendMail({ from: `"${getEmpresa().nombre}" <${process.env.EMAIL_USER}>`, to: dest, subject: asunto, html }); return true; } catch(e) { return false; } }

['admin','tienda','checkout','login','registro','perfil','recuperar','mis-pedidos'].forEach(p => app.get('/' + p, (req, res) => res.sendFile(path.join(__dirname, 'public', p + '.html'))));
app.get('/', (req, res) => res.redirect('/tienda'));
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => { res.redirect(`/tienda?token=${jwt.sign({ id: req.user.id, email: req.user.email, nombre: req.user.nombre, rol: req.user.rol }, JWT_SECRET, { expiresIn: '7d' })}`); });

app.post('/admin/login', async (req, res) => { try { const { usuario, password } = req.body; const p = db.prepare('SELECT * FROM perfiles WHERE usuario = ? AND activo = 1').get(usuario); if (!p) return res.status(401).json({ error: 'Usuario no encontrado' }); if (!(await bcrypt.compare(password, p.password))) return res.status(401).json({ error: 'Contraseña incorrecta' }); logActividad(p.nombre, 'LOGIN_ADMIN', 'Inicio de sesión', req); res.json({ success: true, token: jwt.sign({ id: p.id, usuario: p.usuario, nombre: p.nombre, rol: p.rol, permisos: JSON.parse(p.permisos||'[]'), tipo: 'admin' }, JWT_SECRET, { expiresIn: '8h' }), perfil: { id: p.id, usuario: p.usuario, nombre: p.nombre, rol: p.rol, permisos: JSON.parse(p.permisos||'[]') } }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/admin/cambiar-password', adminMiddleware(), async (req, res) => { try { const { passwordActual, passwordNueva } = req.body; if (!passwordActual || !passwordNueva || passwordNueva.length < 6) return res.status(400).json({ error: 'Datos inválidos' }); const p = db.prepare('SELECT * FROM perfiles WHERE id = ?').get(req.admin.id); if (!p) return res.status(404).json({ error: 'Perfil no encontrado' }); if (!(await bcrypt.compare(passwordActual, p.password))) return res.status(401).json({ error: 'Contraseña incorrecta' }); db.prepare('UPDATE perfiles SET password = ? WHERE id = ?').run(await bcrypt.hash(passwordNueva, 10), req.admin.id); logActividad(req.admin.nombre, 'CAMBIO_PASSWORD', 'Cambió su contraseña', req); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/admin/perfiles', adminMiddleware(), (req, res) => res.json({ lista: db.prepare('SELECT id, usuario, nombre, rol, permisos, activo FROM perfiles ORDER BY fechaCreacion DESC').all().map(p => ({ ...p, permisos: JSON.parse(p.permisos||'[]') })) }));
app.post('/admin/crear-perfil', async (req, res) => { try { const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) return res.status(401).json({ error: 'No autorizado' }); let decoded; try { decoded = jwt.verify(token, JWT_SECRET); } catch(e) { return res.status(401).json({ error: 'Token inválido' }); } if (decoded.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' }); const { adminPassword, usuario, password, nombre, permisos } = req.body; if (!adminPassword || !usuario || !password || !nombre) return res.status(400).json({ error: 'Todos los campos requeridos' }); const adminPerfil = db.prepare('SELECT * FROM perfiles WHERE usuario = ?').get('admin'); if (!adminPerfil) return res.status(404).json({ error: 'Admin no encontrado' }); if (!(await bcrypt.compare(adminPassword, adminPerfil.password))) return res.status(401).json({ error: 'Contraseña incorrecta' }); if (db.prepare('SELECT id FROM perfiles WHERE usuario = ?').get(usuario)) return res.status(400).json({ error: 'Usuario ya existe' }); db.prepare('INSERT INTO perfiles (id, usuario, password, nombre, rol, permisos) VALUES (?,?,?,?,?,?)').run('PERF-' + Date.now(), usuario, await bcrypt.hash(password, 10), nombre, 'vendedor', JSON.stringify(permisos||[])); logActividad(decoded.nombre, 'CREAR_PERFIL', `Creó perfil: ${nombre} (${usuario})`, req); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/admin/editar-perfil', adminMiddleware(), (req, res) => { try { const { id, nombre, permisos, activo } = req.body; const p = db.prepare('SELECT * FROM perfiles WHERE id = ?').get(id); if (!p || p.rol === 'admin') return res.status(400).json({ error: 'No se puede editar' }); db.prepare('UPDATE perfiles SET nombre=?, permisos=?, activo=? WHERE id=?').run(nombre||p.nombre, JSON.stringify(permisos||[]), activo!==undefined?activo:p.activo, id); logActividad(req.admin.nombre, 'EDITAR_PERFIL', `Editó perfil: ${id}`, req); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });

app.post('/auth/registro', async (req, res) => { try { const { nombre, apellido, email, dni, telefono, password } = req.body; if (!nombre || !apellido || !email || !dni || !password) return res.status(400).json({ error: 'Completá todos los campos' }); if (db.prepare('SELECT id FROM usuarios WHERE email=?').get(email)) return res.status(400).json({ error: 'Email ya registrado' }); const id = 'USR-' + Date.now(); db.prepare('INSERT INTO usuarios (id,nombre,apellido,email,dni,telefono,password,rol) VALUES (?,?,?,?,?,?,?,?)').run(id, nombre, apellido, email, dni, telefono||'', await bcrypt.hash(password, 10), 'cliente'); logActividad('Sistema', 'REGISTRO_CLIENTE', `Nuevo cliente: ${email} - DNI: ${dni}`, req); res.json({ success: true, token: jwt.sign({ id, email, nombre, rol: 'cliente' }, JWT_SECRET, { expiresIn: '7d' }), usuario: { id, nombre, apellido, email } }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/auth/login', async (req, res) => { try { const { email, password } = req.body; const u = db.prepare('SELECT * FROM usuarios WHERE email=?').get(email); if (!u?.password || !(await bcrypt.compare(password, u.password))) return res.status(401).json({ error: 'Credenciales inválidas' }); logActividad('Sistema', 'LOGIN_CLIENTE', `Cliente: ${email}`, req); res.json({ success: true, token: jwt.sign({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol }, JWT_SECRET, { expiresIn: '7d' }), usuario: { id: u.id, nombre: u.nombre, apellido: u.apellido, email: u.email } }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/auth/recuperar', async (req, res) => { try { const u = db.prepare('SELECT * FROM usuarios WHERE email=?').get(req.body.email); if (!u) return res.status(404).json({ error: 'Email no encontrado' }); const pin = Math.floor(100000 + Math.random()*900000).toString(); db.prepare('UPDATE usuarios SET resetPin=?, resetPinExpires=? WHERE id=?').run(pin, Date.now()+3600000, u.id); enviarEmail(u.email, 'Recuperación', `<h1>Casa Elegida</h1><p>PIN: <strong>${pin}</strong></p>`); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/auth/reset-password', async (req, res) => { try { const { email, pin, newPassword } = req.body; const u = db.prepare('SELECT * FROM usuarios WHERE email=?').get(email); if (!u || u.resetPin !== pin || u.resetPinExpires < Date.now()) return res.status(400).json({ error: 'PIN inválido' }); db.prepare('UPDATE usuarios SET password=?, resetPin=NULL, resetPinExpires=NULL WHERE id=?').run(await bcrypt.hash(newPassword, 10), u.id); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.get('/auth/me', authMiddleware, (req, res) => { const u = db.prepare('SELECT id,nombre,apellido,email,telefono,dni FROM usuarios WHERE id=?').get(req.usuario.id); res.json(u || {}); });
app.post('/auth/update-profile', authMiddleware, (req, res) => { db.prepare('UPDATE usuarios SET telefono=? WHERE id=?').run(req.body.telefono||'', req.usuario.id); res.json({ success: true }); });

app.post('/listar', (req, res) => res.json({ lista: db.prepare('SELECT * FROM productos ORDER BY id DESC').all().map(p => ({ ...p, variantes: db.prepare('SELECT * FROM variantes WHERE productoId=?').all(p.id) })) }));
app.post('/guardar-producto', (req, res) => { try { const p = req.body; if (!p.nombre?.trim() || p.precio <= 0) return res.status(400).json({ error: 'Datos inválidos' }); if (db.prepare('SELECT id FROM productos WHERE id=?').get(p.id)) { db.prepare('UPDATE productos SET nombre=?,precio=?,precioMayor=?,descripcion=?,categoriaId=?,subcategoria=? WHERE id=?').run(p.nombre, p.precio, p.precioMayor||0, p.descripcion||'', p.categoriaId||null, p.subcategoria||'', p.id); db.prepare('DELETE FROM variantes WHERE productoId=?').run(p.id); } else { db.prepare('INSERT INTO productos (id,nombre,precio,precioMayor,descripcion,categoriaId,subcategoria) VALUES (?,?,?,?,?,?,?)').run(p.id, p.nombre, p.precio, p.precioMayor||0, p.descripcion||'', p.categoriaId||null, p.subcategoria||''); } if (p.variantes?.length) { const ins = db.prepare('INSERT INTO variantes (productoId,nombre,stock,foto) VALUES (?,?,?,?)'); p.variantes.forEach(v => ins.run(p.id, v.nombre, v.stock||0, v.foto||'')); } logActividad('Admin', 'GUARDAR_PRODUCTO', `Producto: ${p.nombre}`, req); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/eliminar-producto', (req, res) => { db.prepare('DELETE FROM productos WHERE id=?').run(req.body.id); logActividad('Admin', 'ELIMINAR_PRODUCTO', `ID: ${req.body.id}`, req); res.json({ success: true }); });
app.post('/reordenar-productos', (req, res) => res.json({ success: true }));
app.post('/verificar-stock', (req, res) => { try { const v = db.prepare('SELECT stock FROM variantes WHERE productoId=? AND nombre=?').get(req.body.productoId, req.body.varianteNombre); if (!v) return res.status(404).json({ error: 'No encontrada' }); res.json({ stock: v.stock }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/stock-bajo', (req, res) => res.json({ stockBajo: db.prepare('SELECT v.*, p.nombre as pn FROM variantes v JOIN productos p ON v.productoId=p.id WHERE v.stock <= ?').all(req.body.minimo||5) }));

app.post('/subir-imagen', upload.single('foto'), async (req, res) => { if (!req.file) return res.status(400).json({ error: 'No imagen' }); const r = await cloudinary.uploader.upload(req.file.path, { folder: 'casa-elegida' }); fs.unlinkSync(req.file.path); res.json({ url: r.secure_url }); });
app.post('/subir-logo', upload.single('logo'), async (req, res) => { if (!req.file) return res.status(400).json({ error: 'No imagen' }); const r = await cloudinary.uploader.upload(req.file.path, { folder: 'casa-elegida' }); fs.unlinkSync(req.file.path); setConfig('logo', r.secure_url); logActividad('Admin', 'SUBIR_LOGO', 'Logo actualizado', req); res.json({ success: true }); });
app.post('/eliminar-logo', (req, res) => { setConfig('logo', ''); res.json({ success: true }); });

app.post('/listar-categorias', (req, res) => res.json({ lista: db.prepare('SELECT * FROM categorias').all().map(c => ({ ...c, subcategorias: JSON.parse(c.subcategorias||'[]') })) }));
app.post('/guardar-categoria', (req, res) => { const { id, nombre, subcategorias } = req.body; if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' }); if (db.prepare('SELECT id FROM categorias WHERE id=?').get(id)) db.prepare('UPDATE categorias SET nombre=?,subcategorias=? WHERE id=?').run(nombre.trim(), JSON.stringify(subcategorias||[]), id); else db.prepare('INSERT INTO categorias (id,nombre,subcategorias) VALUES (?,?,?)').run(id||Date.now(), nombre.trim(), JSON.stringify(subcategorias||[])); logActividad('Admin', 'GUARDAR_CATEGORIA', `Categoría: ${nombre}`, req); res.json({ success: true }); });
app.post('/eliminar-categoria', (req, res) => { db.prepare('DELETE FROM categorias WHERE id=?').run(req.body.id); res.json({ success: true }); });

app.post('/listar-metodos-envio', (req, res) => res.json({ lista: db.prepare('SELECT nombre FROM metodos_envio').all().map(m => m.nombre) }));
app.post('/guardar-metodos-envio', (req, res) => { db.prepare('DELETE FROM metodos_envio').run(); (req.body.lista||[]).forEach(m => db.prepare('INSERT INTO metodos_envio (nombre) VALUES (?)').run(m)); res.json({ success: true }); });

app.post('/get-config', (req, res) => res.json(getConfig()));
app.post('/save-config', (req, res) => { ['empresa','horarios','redes','pagos'].forEach(k => { if(req.body[k]) setConfig(k, req.body[k]); }); logActividad('Admin', 'GUARDAR_CONFIG', 'Configuración actualizada', req); res.json({ success: true }); });
app.post('/save-tienda-config', (req, res) => { if(req.body.tienda) setConfig('tienda', req.body.tienda); res.json({ success: true }); });
app.post('/save-mayorista-config', (req, res) => { setConfig('mayorista', req.body); logActividad('Admin', 'GUARDAR_MAYORISTA', JSON.stringify(req.body), req); res.json({ success: true }); });
app.post('/save-diseno-config', (req, res) => { if(req.body.diseno) setConfig('diseno', req.body.diseno); res.json({ success: true }); });
app.post('/save-home-config', (req, res) => { if(req.body.heroConfig) setConfig('heroConfig', req.body.heroConfig); res.json({ success: true }); });

app.post('/confirmar-venta', (req, res) => { try { const { carrito, pago, logistica, cliente } = req.body; if (!carrito?.length) return res.status(400).json({ error: 'Carrito vacío' }); for (let it of carrito) { if(it.esManual) continue; db.prepare('UPDATE variantes SET stock=stock-? WHERE productoId=? AND nombre=?').run(it.cant, it.pId, it.vNom); } const id = 'FAC-' + Date.now(); db.prepare("INSERT INTO ventas (id,fecha,fechaTimestamp,items,total,metodoPago,logistica,cliente,estado,origen) VALUES (?,datetime('now','localtime'),?,?,?,?,?,?,'completada','admin')").run(id, Date.now(), JSON.stringify(carrito), pago.total, pago.metodo, logistica, JSON.stringify(cliente||{nombre:'Mostrador'})); crearNotificacion('venta', '💰 Venta', `${id}`); logActividad(req.admin?.nombre || 'Admin', 'VENTA', `Venta ${id} - ${fmt.format(pago.total)}`, req); res.json({ success: true, ventaId: id }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/listar-ventas', (req, res) => res.json({ lista: db.prepare('SELECT * FROM ventas ORDER BY fechaTimestamp DESC').all().map(v => ({ ...v, items: JSON.parse(v.items||'[]'), cliente: JSON.parse(v.cliente||'{}'), pago: { total: v.total, metodo: v.metodoPago } })) }));
app.post('/corte-caja', (req, res) => { const v = db.prepare("SELECT * FROM ventas WHERE date(fecha) = date('now','localtime')").all(); res.json({ total: v.reduce((s,x)=>s+x.total,0), cantidad: v.length }); });

app.post('/tienda/listar-productos', (req, res) => { const c = getConfig(); res.json({ productos: db.prepare('SELECT * FROM productos ORDER BY id DESC').all().map(p => ({ ...p, variantes: db.prepare('SELECT * FROM variantes WHERE productoId=?').all(p.id) })), categorias: db.prepare('SELECT * FROM categorias').all().map(x => ({ ...x, subcategorias: JSON.parse(x.subcategorias||'[]') })), metodosEnvio: db.prepare('SELECT nombre FROM metodos_envio').all().map(m => m.nombre), configuracion: c }); });
app.post('/tienda/crear-pedido', authMiddleware, (req, res) => { try { const { carrito, cliente, total, tipoEntrega, metodoEnvio } = req.body; if (!carrito?.length) return res.status(400).json({ error: 'Carrito vacío' }); const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.usuario.id); cliente.nombre = u.nombre; cliente.apellido = u.apellido; cliente.email = u.email; cliente.dni = u.dni||''; for (let it of carrito) { if(it.esManual) continue; db.prepare('UPDATE variantes SET stock=stock-? WHERE productoId=? AND nombre=?').run(it.cant, it.pId, it.vNom); } const id = 'PED-' + Date.now(); db.prepare("INSERT INTO pedidos (id,fecha,fechaTimestamp,items,total,cliente,tipoEntrega,metodoEnvio,estado,origen,usuarioId) VALUES (?,datetime('now','localtime'),?,?,?,?,?,?,'pendiente','tienda',?)").run(id, Date.now(), JSON.stringify(carrito), total, JSON.stringify(cliente), tipoEntrega, metodoEnvio, u.id); crearNotificacion('pedido', '🛍️ Nuevo pedido', `#${id}`); logActividad(cliente.nombre, 'PEDIDO_WEB', `Pedido #${id} - ${fmt.format(total)}`, req); res.json({ success: true, pedidoId: id }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/tienda/listar-pedidos', (req, res) => res.json({ lista: db.prepare('SELECT * FROM pedidos ORDER BY fechaTimestamp DESC').all().map(p => ({ ...p, items: JSON.parse(p.items||'[]'), cliente: JSON.parse(p.cliente||'{}') })) }));
app.post('/tienda/confirmar-pedido', (req, res) => { try { const p = db.prepare('SELECT * FROM pedidos WHERE id=? AND estado=?').get(req.body.pedidoId, 'pendiente'); if (!p) return res.status(400).json({ error: 'No válido' }); const pin = generarPIN(), vid = 'FAC-' + Date.now(); db.prepare("INSERT INTO ventas (id,fecha,fechaTimestamp,items,total,metodoPago,logistica,cliente,estado,origen,pedidoId) VALUES (?,datetime('now','localtime'),?,?,?,'pedido_online',?,?,'completada','tienda',?)").run(vid, Date.now(), p.items, p.total, p.tipoEntrega==='envio'?'envio':'local', p.cliente, p.id); db.prepare('UPDATE pedidos SET estado=?,pin=?,ventaId=? WHERE id=?').run('confirmado', pin, vid, p.id); logActividad('Admin', 'CONFIRMAR_PEDIDO', `Pedido ${p.id} - PIN: ${pin}`, req); res.json({ success: true, ventaId: vid, pin }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/tienda/cancelar-pedido', authMiddleware, (req, res) => { const p = db.prepare('SELECT * FROM pedidos WHERE id=? AND usuarioId=? AND estado=?').get(req.body.pedidoId, req.usuario.id, 'pendiente'); if (!p) return res.status(400).json({ error: 'No se puede cancelar' }); JSON.parse(p.items||'[]').forEach(it => { if(!it.esManual) db.prepare('UPDATE variantes SET stock=stock+? WHERE productoId=? AND nombre=?').run(it.cant, it.pId, it.vNom); }); db.prepare("UPDATE pedidos SET estado='cancelado' WHERE id=?").run(p.id); logActividad('Sistema', 'CANCELAR_PEDIDO', `Pedido ${p.id} cancelado por cliente`, req); res.json({ success: true }); });
app.post('/tienda/marcar-abonado', (req, res) => { db.prepare("UPDATE pedidos SET estado='abonado' WHERE id=?").run(req.body.pedidoId); logActividad('Admin', 'PEDIDO_ABONADO', `Pedido ${req.body.pedidoId} marcado como abonado`, req); res.json({ success: true }); });
app.post('/tienda/marcar-enviado', (req, res) => { db.prepare("UPDATE pedidos SET estado='enviado' WHERE id=?").run(req.body.pedidoId); logActividad('Admin', 'PEDIDO_ENVIADO', `Pedido ${req.body.pedidoId} enviado`, req); res.json({ success: true }); });
app.post('/tienda/marcar-entregado', (req, res) => { db.prepare("UPDATE pedidos SET estado='entregado' WHERE id=?").run(req.body.pedidoId); res.json({ success: true }); });
app.post('/tienda/cancelar-pedido-admin', (req, res) => { const p = db.prepare('SELECT * FROM pedidos WHERE id=?').get(req.body.pedidoId); if (!p) return res.status(400).json({ error: 'No encontrado' }); JSON.parse(p.items||'[]').forEach(it => { if(!it.esManual) db.prepare('UPDATE variantes SET stock=stock+? WHERE productoId=? AND nombre=?').run(it.cant, it.pId, it.vNom); }); db.prepare("UPDATE pedidos SET estado='cancelado' WHERE id=?").run(p.id); res.json({ success: true }); });
app.post('/tienda/retirar-pedido', (req, res) => { const p = db.prepare('SELECT * FROM pedidos WHERE id=? AND pin=?').get(req.body.pedidoId, req.body.pin); if (!p) return res.status(400).json({ error: 'PIN incorrecto' }); db.prepare("UPDATE pedidos SET estado='entregado' WHERE id=?").run(p.id); logActividad('Admin', 'RETIRO_PEDIDO', `Pedido ${req.body.pedidoId} retirado con PIN`, req); res.json({ success: true }); });
app.post('/tienda/verificar-pin', (req, res) => { const p = db.prepare("SELECT * FROM pedidos WHERE pin=? AND estado IN ('confirmado','abonado')").get(req.body.pin); if (!p) return res.status(400).json({ error: 'PIN no encontrado' }); res.json({ success: true, pedido: { ...p, cliente: JSON.parse(p.cliente||'{}'), items: JSON.parse(p.items||'[]') } }); });

app.post('/dashboard/stats', (req, res) => { const h = new Date(); h.setHours(0,0,0,0); const v = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(total),0) as t FROM ventas WHERE fechaTimestamp >= ?').get(h.getTime()); res.json({ ventasHoy: v.c, totalHoy: v.t }); });
app.post('/admin/estadisticas-avanzadas', adminMiddleware('dashboard'), (req, res) => { res.json({ ventasHoy: 0, ventasMes: 0, totalClientes: db.prepare('SELECT COUNT(*) as c FROM usuarios').get().c, totalProductos: db.prepare('SELECT COUNT(*) as c FROM productos').get().c, pedidosPendientes: db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE estado IN ('pendiente','confirmado','abonado')").get().c, productosAgotados: 0 }); });
app.post('/admin/buscar-clientes', adminMiddleware(), (req, res) => { const q = `%${req.body.query||''}%`; res.json({ lista: db.prepare('SELECT id, nombre, apellido, email, telefono, dni FROM usuarios WHERE nombre LIKE ? OR apellido LIKE ? OR email LIKE ? OR dni LIKE ? LIMIT 20').all(q,q,q,q) }); });
app.post('/admin/exportar-ventas', adminMiddleware(), (req, res) => { let csv = '\uFEFFFecha;ID;Cliente;Total\n'; db.prepare('SELECT * FROM ventas ORDER BY fechaTimestamp DESC').all().forEach(v => { const c = JSON.parse(v.cliente||'{}'); csv += `"${v.fecha}";"${v.id}";"${c.nombre||'Mostrador'}";"${v.total}"\n`; }); res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename=ventas.csv'); res.send(csv); });
app.post('/admin/apertura-caja', adminMiddleware('ventas'), (req, res) => { db.prepare("INSERT OR REPLACE INTO caja_diaria (fecha, montoInicial, abiertaPor, estado, aperturaTimestamp) VALUES (?, ?, ?, 'abierta', ?)").run(new Date().toLocaleDateString('es-AR'), req.body.montoInicial||0, req.admin.nombre, Date.now()); logActividad(req.admin.nombre, 'APERTURA_CAJA', `Monto inicial: ${fmt.format(req.body.montoInicial||0)}`, req); res.json({ success: true }); });
app.post('/admin/cierre-caja', adminMiddleware('ventas'), (req, res) => { const hoy = new Date().toLocaleDateString('es-AR'); const v = db.prepare("SELECT COALESCE(SUM(total),0) as t, COUNT(*) as c FROM ventas WHERE date(fecha) = date('now','localtime')").get(); db.prepare("UPDATE caja_diaria SET estado='cerrada', totalVentas=?, totalEsperado=? WHERE fecha=? AND estado='abierta'").run(v.t, (db.prepare('SELECT montoInicial FROM caja_diaria WHERE fecha=?').get(hoy)?.montoInicial||0)+v.t, hoy); logActividad(req.admin.nombre, 'CIERRE_CAJA', `Total vendido: ${fmt.format(v.t)}`, req); res.json({ success: true, resumen: { totalVentas: v.t, cantidadVentas: v.c } }); });
app.post('/admin/estado-caja', (req, res) => { try { const hoy = new Date().toLocaleDateString('es-AR'); const caja = db.prepare('SELECT * FROM caja_diaria WHERE fecha = ? AND estado = ?').get(hoy, 'abierta'); if (!caja) return res.json({ abierta: false }); const ventasHoy = db.prepare("SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM ventas WHERE date(fecha) = date('now','localtime')").get(); res.json({ abierta: true, montoInicial: caja.montoInicial, totalVentas: ventasHoy.total, cantidadVentas: ventasHoy.count, abiertaPor: caja.abiertaPor, totalEsperado: caja.montoInicial + ventasHoy.total }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.post('/admin/estadisticas-vendedor', adminMiddleware('dashboard'), (req, res) => { const logs = db.prepare("SELECT admin, accion, COUNT(*) as c FROM logs_admin WHERE accion IN ('VENTA','CONFIRMAR_PEDIDO') GROUP BY admin").all(); const v = {}; logs.forEach(l => { if(!v[l.admin]) v[l.admin]={nombre:l.admin,ventas:0,pedidos:0}; if(l.accion==='VENTA')v[l.admin].ventas+=l.c; else v[l.admin].pedidos+=l.c; }); res.json({ lista: Object.values(v) }); });

app.post('/notificaciones', (req, res) => res.json({ lista: db.prepare('SELECT * FROM notificaciones ORDER BY fecha DESC LIMIT 50').all() }));
app.post('/notificaciones/leer', (req, res) => { db.prepare('UPDATE notificaciones SET leida=1 WHERE id=?').run(req.body.id); res.json({ success: true }); });
app.post('/notificaciones/leer-todas', (req, res) => { db.prepare('UPDATE notificaciones SET leida=1').run(); res.json({ success: true }); });

app.post('/logs/admin', (req, res) => {
    try {
        const { filtro, desde, hasta } = req.body;
        let query = 'SELECT * FROM logs_admin';
        let params = [];
        let conditions = [];
        if (filtro) { conditions.push('(admin LIKE ? OR accion LIKE ? OR detalles LIKE ?)'); params.push(`%${filtro}%`, `%${filtro}%`, `%${filtro}%`); }
        if (desde) { conditions.push('date(fecha) >= ?'); params.push(desde); }
        if (hasta) { conditions.push('date(fecha) <= ?'); params.push(hasta); }
        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY fecha DESC LIMIT 500';
        const logs = db.prepare(query).all(...params);
        res.json({ lista: logs });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/mis-pedidos', authMiddleware, (req, res) => res.json({ lista: db.prepare('SELECT * FROM pedidos WHERE usuarioId=? ORDER BY fechaTimestamp DESC').all(req.usuario.id).map(p => ({ ...p, items: JSON.parse(p.items||'[]'), cliente: JSON.parse(p.cliente||'{}') })) }));

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Error interno' }); });

app.listen(PORT, () => { console.log(`\n🏪 CASA ELEGIDA - http://localhost:${PORT}\n`); setInterval(crearBackup, 30 * 60 * 1000); });
process.on('SIGTERM', () => { crearBackup(); db.close(); process.exit(0); });
process.on('SIGINT', () => { crearBackup(); db.close(); process.exit(0); });
process.on('SIGUSR2', () => { crearBackup(); db.close(); process.exit(0); });

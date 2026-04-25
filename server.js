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

// ==================== BASE DE DATOS SQLite ====================
const db = new Database('./data.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Crear tablas
db.exec(`
    CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL DEFAULT 0,
        precioMayor REAL DEFAULT 0,
        descripcion TEXT DEFAULT '',
        categoriaId INTEGER,
        subcategoria TEXT DEFAULT '',
        fechaCreacion TEXT DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS variantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productoId INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        stock INTEGER DEFAULT 0,
        foto TEXT DEFAULT '',
        FOREIGN KEY (productoId) REFERENCES productos(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL,
        subcategorias TEXT DEFAULT '[]'
    );
    
    CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        apellido TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        telefono TEXT DEFAULT '',
        dni TEXT DEFAULT '',
        password TEXT,
        googleId TEXT,
        foto TEXT DEFAULT '',
        rol TEXT DEFAULT 'cliente',
        resetPin TEXT,
        resetPinExpires INTEGER,
        fechaRegistro TEXT DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS ventas (
        id TEXT PRIMARY KEY,
        fecha TEXT,
        fechaTimestamp INTEGER,
        items TEXT DEFAULT '[]',
        total REAL DEFAULT 0,
        metodoPago TEXT DEFAULT 'efectivo',
        logistica TEXT DEFAULT 'local',
        cliente TEXT DEFAULT '{}',
        esMayorista INTEGER DEFAULT 0,
        razonMayorista TEXT DEFAULT '',
        estado TEXT DEFAULT 'completada',
        origen TEXT DEFAULT 'admin',
        pedidoId TEXT
    );
    
    CREATE TABLE IF NOT EXISTS pedidos (
        id TEXT PRIMARY KEY,
        fecha TEXT,
        fechaTimestamp INTEGER,
        items TEXT DEFAULT '[]',
        total REAL DEFAULT 0,
        cliente TEXT DEFAULT '{}',
        tipoEntrega TEXT DEFAULT 'local',
        metodoEnvio TEXT DEFAULT '',
        esMayorista INTEGER DEFAULT 0,
        razonMayorista TEXT DEFAULT '',
        estado TEXT DEFAULT 'pendiente',
        origen TEXT DEFAULT 'tienda',
        pin TEXT,
        ventaId TEXT,
        usuarioId TEXT,
        stockDescontado INTEGER DEFAULT 1,
        fechaCancelado TEXT,
        fechaAbonado TEXT,
        fechaEnviado TEXT,
        fechaEntregado TEXT
    );
    
    CREATE TABLE IF NOT EXISTS notificaciones (
        id TEXT PRIMARY KEY,
        tipo TEXT,
        titulo TEXT,
        descripcion TEXT,
        fecha TEXT,
        leida INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT
    );
    
    CREATE TABLE IF NOT EXISTS metodos_envio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS logs_admin (
        id TEXT PRIMARY KEY,
        admin TEXT,
        accion TEXT,
        detalles TEXT,
        ip TEXT,
        fecha TEXT DEFAULT (datetime('now')),
        fechaLocal TEXT
    );
    
    CREATE TABLE IF NOT EXISTS perfiles (
        id TEXT PRIMARY KEY,
        usuario TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nombre TEXT NOT NULL,
        rol TEXT DEFAULT 'vendedor',
        permisos TEXT DEFAULT '[]',
        activo INTEGER DEFAULT 1,
        fechaCreacion TEXT DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS caja_diaria (
        fecha TEXT PRIMARY KEY,
        montoInicial REAL DEFAULT 0,
        abiertaPor TEXT,
        cerradaPor TEXT,
        estado TEXT DEFAULT 'cerrada',
        aperturaTimestamp INTEGER,
        cierreTimestamp INTEGER,
        totalVentas REAL DEFAULT 0,
        totalEsperado REAL DEFAULT 0,
        detallePagos TEXT DEFAULT '{}'
    );
`);

// Insertar configuración por defecto
const configInicial = {
    logo: '',
    empresa: JSON.stringify({ nombre: "Casa Elegida", telefono: "", email: "casaelegida20@gmail.com", direccion: "" }),
    horarios: JSON.stringify({ lunesViernes: "9:00 - 13:00 y 17:00 - 20:00", sabados: "9:00 - 13:00", domingos: "Cerrado" }),
    redes: JSON.stringify({ instagram: "", instagramUrl: "", facebook: "", facebookUrl: "", tiktok: "", tiktokUrl: "", whatsapp: "", whatsappUrl: "" }),
    pagos: JSON.stringify({ alias: "", cbu: "", banco: "", titular: "" }),
    mayorista: JSON.stringify({ habilitado: false, modo: "cantidad", valorCantidad: 3, valorMonto: 80000 }),
    tienda: JSON.stringify({ habilitada: true, titulo: "Casa Elegida", mensajeBienvenida: "Calidad y confort para tu hogar", retiroLocal: true }),
    diseno: JSON.stringify({ colorPrimario: "#1a1a1a", colorSecundario: "#c9a96e", colorFondo: "#fafafa", colorTexto: "#1a1a1a" }),
    registroObligatorio: 'true',
    heroConfig: JSON.stringify({ titulo: "Casa Elegida", subtitulo: "Blanquería premium • Toallones, sábanas, mantas", badge: "✦ Precios especiales por cantidad" }),
    seccionesDestacadas: JSON.stringify([{ id: "dest-1", titulo: "Novedades", tipo: "categoria", valor: "Toallones", limite: 4 }])
};

const insertConfig = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
for (const [clave, valor] of Object.entries(configInicial)) {
    insertConfig.run(clave, valor);
}

// Métodos de envío por defecto
const metodosEnvioDefault = ['Via Cargo', 'Correo Argentino', 'Andreani', 'Moto Mensajería'];
const insertMetodo = db.prepare('INSERT OR IGNORE INTO metodos_envio (nombre) VALUES (?)');
metodosEnvioDefault.forEach(m => insertMetodo.run(m));

// Admin por defecto
const adminExiste = db.prepare('SELECT id FROM perfiles WHERE rol = ?').get('admin');
if (!adminExiste) {
    const hashedPassword = bcrypt.hashSync('NacentLion03-04-04', 10);
    db.prepare('INSERT INTO perfiles (id, usuario, password, nombre, rol, permisos) VALUES (?, ?, ?, ?, ?, ?)')
      .run('PERF-' + Date.now(), 'admin', hashedPassword, 'Administrador Principal', 'admin', '[]');
    console.log('✅ Admin creado: usuario=admin');
}

// ==================== FUNCIONES AUXILIARES ====================
function getConfig() {
    const rows = db.prepare('SELECT clave, valor FROM configuracion').all();
    const config = {};
    rows.forEach(r => {
        try { config[r.clave] = JSON.parse(r.valor); } catch(e) { config[r.clave] = r.valor; }
    });
    return config;
}

function setConfig(clave, valor) {
    const v = typeof valor === 'string' ? valor : JSON.stringify(valor);
    db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)').run(clave, v);
}

function getEmpresa() {
    const config = getConfig();
    if (typeof config.empresa === 'string') return JSON.parse(config.empresa);
    return config.empresa || { nombre: 'Casa Elegida', telefono: '', email: '', direccion: '' };
}

function logActividad(admin, accion, detalles, req) {
    try {
        const id = 'LOG-' + Date.now();
        const ip = req?.ip || req?.connection?.remoteAddress || 'localhost';
        const fecha = new Date().toISOString();
        const fechaLocal = new Date().toLocaleString('es-AR', { 
            year: 'numeric', month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });
        const detalleStr = typeof detalles === 'string' ? detalles.substring(0, 200) : JSON.stringify(detalles).substring(0, 200);
        db.prepare('INSERT INTO logs_admin (id, admin, accion, detalles, ip, fecha, fechaLocal) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, admin || 'Sistema', accion, detalleStr, ip, fecha, fechaLocal);
    } catch(e) { console.error('Error guardando log:', e); }
}

// ==================== CONFIGURACIÓN DE SERVICIOS ====================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Directorios
['./uploads', './backups', './public'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ 
    storage, limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        cb(null, allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype));
    }
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } }));
app.use(passport.initialize());
app.use(passport.session());
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Google OAuth
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(profile.emails[0].value);
        if (!u) {
            const id = 'USR-' + Date.now();
            db.prepare('INSERT INTO usuarios (id, nombre, apellido, email, googleId, foto, rol) VALUES (?,?,?,?,?,?,?)')
              .run(id, profile.name.givenName||'', profile.name.familyName||'', profile.emails[0].value, profile.id, profile.photos?.[0]?.value||'', 'cliente');
            u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
        }
        return done(null, u);
    } catch(e) { return done(e, null); }
}));
passport.serializeUser((u, d) => d(null, u.id));
passport.deserializeUser((id, d) => d(null, db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) || null));

// Middleware cliente
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    try { req.usuario = jwt.verify(token, JWT_SECRET); next(); } 
    catch(e) { res.status(401).json({ error: 'Token inválido' }); }
};

// Middleware admin
const adminMiddleware = (permiso = null) => (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.tipo !== 'admin') return res.status(401).json({ error: 'No autorizado' });
        if (decoded.rol === 'admin') { req.admin = decoded; return next(); }
        if (permiso && !decoded.permisos.includes(permiso)) return res.status(403).json({ error: 'Sin permiso' });
        req.admin = decoded;
        next();
    } catch(e) { res.status(401).json({ error: 'Token inválido' }); }
};

// Helpers
const generarPIN = () => Math.floor(1000 + Math.random() * 9000).toString();
function crearNotificacion(tipo, titulo, desc) {
    db.prepare("INSERT INTO notificaciones (id, tipo, titulo, descripcion, fecha, leida) VALUES (?,?,?,?,datetime('now'),0)")
      .run('NOTIF-' + Date.now(), tipo, titulo, desc);
}

async function enviarEmail(dest, asunto, html) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return false;
    try {
        await transporter.sendMail({ from: `"${getEmpresa().nombre}" <${process.env.EMAIL_USER}>`, to: dest, subject: asunto, html });
        return true;
    } catch(e) { return false; }
}

async function enviarWhatsAppAdmin(pedido, tipo) {
    try {
        const config = getConfig();
        const redes = typeof config.redes === 'string' ? JSON.parse(config.redes) : config.redes;
        const whatsapp = redes?.whatsapp || config.empresa?.whatsapp;
        if (!whatsapp) return false;
        
        const cliente = typeof pedido.cliente === 'string' ? JSON.parse(pedido.cliente) : pedido.cliente;
        const items = typeof pedido.items === 'string' ? JSON.parse(pedido.items) : pedido.items;
        
        let mensaje = '';
        if (tipo === 'nuevo_pedido') {
            mensaje = `🛍️ *NUEVO PEDIDO WEB*\n\n`;
            mensaje += `📦 Pedido: *${pedido.id}*\n`;
            mensaje += `👤 Cliente: ${cliente.nombre} ${cliente.apellido}\n`;
            mensaje += `📧 Email: ${cliente.email}\n`;
            mensaje += `📱 Tel: ${cliente.telefono || 'No especificado'}\n`;
            mensaje += `📋 DNI: ${cliente.dni || 'No especificado'}\n\n`;
            mensaje += `🛒 *Productos:*\n`;
            items.forEach(i => {
                mensaje += `• ${i.cant}x ${i.pNom} (${i.vNom}) - ${fmt.format(i.precio * i.cant)}\n`;
            });
            mensaje += `\n💰 *Total: ${fmt.format(pedido.total)}*\n`;
            mensaje += `🚚 Entrega: ${pedido.tipoEntrega === 'local' ? 'Retiro en local' : 'Envío a domicilio'}\n`;
        } else if (tipo === 'venta_admin') {
            mensaje = `💰 *VENTA EN LOCAL*\n\n`;
            mensaje += `🧾 Factura: *${pedido.id}*\n`;
            mensaje += `👤 Cliente: ${cliente.nombre || 'Mostrador'}\n`;
            mensaje += `💵 Total: ${fmt.format(pedido.total)}\n`;
            mensaje += `💳 Pago: ${pedido.metodoPago || 'efectivo'}\n`;
        }
        console.log(`📱 WhatsApp: ${mensaje.substring(0, 100)}...`);
        return true;
    } catch(e) { return false; }
}

// ==================== RUTAS PRINCIPALES ====================
const paginas = ['admin','tienda','checkout','login','registro','perfil','recuperar','mis-pedidos'];
paginas.forEach(p => app.get('/' + p, (req, res) => res.sendFile(path.join(__dirname, 'public', p + '.html'))));
app.get('/', (req, res) => res.redirect('/tienda'));
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    const token = jwt.sign({ id: req.user.id, email: req.user.email, nombre: req.user.nombre, rol: req.user.rol }, JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`/tienda?token=${token}`);
});

// ==================== LOGIN ADMIN ====================
app.post('/admin/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;
        const perfil = db.prepare('SELECT * FROM perfiles WHERE usuario = ? AND activo = 1').get(usuario);
        if (!perfil) return res.status(401).json({ error: 'Usuario no encontrado' });
        const ok = await bcrypt.compare(password, perfil.password);
        if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });
        const token = jwt.sign({ id: perfil.id, usuario: perfil.usuario, nombre: perfil.nombre, rol: perfil.rol, permisos: JSON.parse(perfil.permisos||'[]'), tipo: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
        logActividad(perfil.nombre, 'LOGIN_ADMIN', 'Inicio de sesión', req);
        res.json({ success: true, token, perfil: { id: perfil.id, usuario: perfil.usuario, nombre: perfil.nombre, rol: perfil.rol, permisos: JSON.parse(perfil.permisos||'[]') } });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== CAMBIAR CONTRASEÑA ====================
app.post('/admin/cambiar-password', adminMiddleware(), async (req, res) => {
    try {
        const { passwordActual, passwordNueva } = req.body;
        if (!passwordActual || !passwordNueva) return res.status(400).json({ error: 'Ambos campos requeridos' });
        if (passwordNueva.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });
        const perfil = db.prepare('SELECT * FROM perfiles WHERE id = ?').get(req.admin.id);
        const ok = await bcrypt.compare(passwordActual, perfil.password);
        if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        const hp = await bcrypt.hash(passwordNueva, 10);
        db.prepare('UPDATE perfiles SET password = ? WHERE id = ?').run(hp, req.admin.id);
        logActividad(req.admin.nombre, 'CAMBIAR_PASSWORD', 'Cambio de contraseña', req);
        res.json({ success: true, message: 'Contraseña actualizada' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== PERFILES ====================
app.post('/admin/perfiles', adminMiddleware(), (req, res) => {
    try {
        const perfiles = db.prepare('SELECT id, usuario, nombre, rol, permisos, activo, fechaCreacion FROM perfiles ORDER BY fechaCreacion DESC').all();
        res.json({ lista: perfiles.map(p => ({ ...p, permisos: JSON.parse(p.permisos||'[]') })) });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/crear-perfil', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.rol !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede crear perfiles' });
        const { adminPassword, usuario, password, nombre, permisos } = req.body;
        if (!adminPassword || !usuario || !password || !nombre) return res.status(400).json({ error: 'Todos los campos requeridos' });
        const adminPerfil = db.prepare('SELECT * FROM perfiles WHERE id = ?').get(decoded.id);
        const ok = await bcrypt.compare(adminPassword, adminPerfil.password);
        if (!ok) return res.status(401).json({ error: 'Contraseña de administrador incorrecta' });
        const existe = db.prepare('SELECT id FROM perfiles WHERE usuario = ?').get(usuario);
        if (existe) return res.status(400).json({ error: 'El usuario ya existe' });
        const hp = await bcrypt.hash(password, 10);
        const id = 'PERF-' + Date.now();
        db.prepare('INSERT INTO perfiles (id, usuario, password, nombre, rol, permisos) VALUES (?,?,?,?,?,?)')
          .run(id, usuario, hp, nombre, 'vendedor', JSON.stringify(permisos||[]));
        logActividad(decoded.nombre, 'CREAR_PERFIL', `Perfil: ${nombre} (${usuario})`, req);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/editar-perfil', adminMiddleware(), (req, res) => {
    try {
        const { id, nombre, permisos, activo } = req.body;
        const perfil = db.prepare('SELECT * FROM perfiles WHERE id = ?').get(id);
        if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' });
        if (perfil.rol === 'admin') return res.status(400).json({ error: 'No se puede editar al admin principal' });
        db.prepare('UPDATE perfiles SET nombre = ?, permisos = ?, activo = ? WHERE id = ?')
          .run(nombre||perfil.nombre, JSON.stringify(permisos||[]), activo!==undefined?activo:perfil.activo, id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==================== AUTENTICACIÓN CLIENTES ====================
app.post('/auth/registro', async (req, res) => {
    try {
        const { nombre, apellido, email, dni, telefono, password } = req.body;
        if (!nombre || !apellido || !email || !dni || !password) return res.status(400).json({ error: 'Completá todos los campos obligatorios (*)' });
        if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)) return res.status(400).json({ error: 'El email ya está registrado' });
        if (db.prepare('SELECT id FROM usuarios WHERE dni = ?').get(dni)) return res.status(400).json({ error: 'El DNI ya está registrado' });
        const hp = await bcrypt.hash(password, 10);
        const id = 'USR-' + Date.now();
        db.prepare('INSERT INTO usuarios (id, nombre, apellido, email, dni, telefono, password, rol) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, nombre, apellido, email, dni, telefono||'', hp, 'cliente');
        const token = jwt.sign({ id, email, nombre, rol:'cliente' }, JWT_SECRET, { expiresIn:'7d' });
        logActividad('Sistema', 'REGISTRO', `Nuevo cliente: ${email}`, req);
        res.json({ success:true, token, usuario:{ id, nombre, apellido, email, dni } });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
        if (!u?.password || !(await bcrypt.compare(password, u.password))) return res.status(401).json({ error:'Credenciales inválidas' });
        const token = jwt.sign({ id:u.id, email:u.email, nombre:u.nombre, rol:u.rol }, JWT_SECRET, { expiresIn:'7d' });
        logActividad(u.nombre, 'LOGIN', 'Inicio de sesión cliente', req);
        res.json({ success:true, token, usuario:{ id:u.id, nombre:u.nombre, apellido:u.apellido, email:u.email, dni:u.dni } });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/auth/recuperar', async (req, res) => {
    try {
        const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(req.body.email);
        if (!u) return res.status(404).json({ error:'Email no encontrado' });
        const pin = Math.floor(100000 + Math.random()*900000).toString();
        db.prepare('UPDATE usuarios SET resetPin=?, resetPinExpires=? WHERE id=?').run(pin, Date.now()+3600000, u.id);
        await enviarEmail(u.email, 'Recuperación de contraseña', `<h1>Casa Elegida</h1><p>Tu PIN: <strong>${pin}</strong></p>`);
        res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/auth/reset-password', async (req, res) => {
    try {
        const { email, pin, newPassword } = req.body;
        const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
        if (!u || u.resetPin !== pin || u.resetPinExpires < Date.now()) return res.status(400).json({ error:'PIN inválido' });
        db.prepare('UPDATE usuarios SET password=?, resetPin=NULL, resetPinExpires=NULL WHERE id=?').run(await bcrypt.hash(newPassword,10), u.id);
        res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/auth/me', authMiddleware, (req, res) => {
    const u = db.prepare('SELECT id,nombre,apellido,email,telefono,dni,foto FROM usuarios WHERE id=?').get(req.usuario.id);
    if (!u) return res.status(404).json({ error:'No encontrado' });
    res.json(u);
});

app.post('/auth/update-profile', authMiddleware, (req, res) => {
    try {
        db.prepare('UPDATE usuarios SET telefono=? WHERE id=?').run(req.body.telefono||'', req.usuario.id);
        res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== PRODUCTOS ====================
app.post('/listar', (req, res) => {
    try {
        const prods = db.prepare('SELECT * FROM productos ORDER BY id DESC').all();
        res.json({ lista: prods.map(p => ({ ...p, variantes: db.prepare('SELECT * FROM variantes WHERE productoId=?').all(p.id) })) });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/guardar-producto', (req, res) => {
    try {
        const p = req.body;
        if (!p.nombre?.trim()) return res.status(400).json({ error:'Nombre requerido' });
        if (p.precio <= 0) return res.status(400).json({ error:'Precio inválido' });
        const existe = db.prepare('SELECT id FROM productos WHERE id=?').get(p.id);
        if (existe) {
            db.prepare('UPDATE productos SET nombre=?,precio=?,precioMayor=?,descripcion=?,categoriaId=?,subcategoria=? WHERE id=?')
              .run(p.nombre, p.precio, p.precioMayor||0, p.descripcion||'', p.categoriaId||null, p.subcategoria||'', p.id);
            db.prepare('DELETE FROM variantes WHERE productoId=?').run(p.id);
        } else {
            db.prepare('INSERT INTO productos (id,nombre,precio,precioMayor,descripcion,categoriaId,subcategoria) VALUES (?,?,?,?,?,?,?)')
              .run(p.id, p.nombre, p.precio, p.precioMayor||0, p.descripcion||'', p.categoriaId||null, p.subcategoria||'');
        }
        if (p.variantes?.length) {
            const ins = db.prepare('INSERT INTO variantes (productoId,nombre,stock,foto) VALUES (?,?,?,?)');
            p.variantes.forEach(v => ins.run(p.id, v.nombre, v.stock||0, v.foto||''));
        }
        logActividad('Admin', 'GUARDAR_PRODUCTO', `Producto: ${p.nombre}`, req);
        res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/eliminar-producto', (req, res) => {
    try { db.prepare('DELETE FROM productos WHERE id=?').run(req.body.id); res.json({ success:true }); } 
    catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/reordenar-productos', (req, res) => res.json({ success:true }));

app.post('/stock-bajo', (req, res) => {
    try {
        const min = req.body.minimo||5;
        const vars = db.prepare('SELECT v.*, p.nombre as productoNombre FROM variantes v JOIN productos p ON v.productoId=p.id WHERE v.stock <= ?').all(min);
        res.json({ stockBajo: vars });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/verificar-stock', (req, res) => {
    try {
        const v = db.prepare('SELECT stock FROM variantes WHERE productoId=? AND nombre=?').get(req.body.productoId, req.body.varianteNombre);
        if (!v) return res.status(404).json({ error:'No encontrada' });
        res.json({ stock: v.stock });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== IMÁGENES ====================
app.post('/subir-imagen', upload.single('foto'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error:'No se recibió imagen' });
        const r = await cloudinary.uploader.upload(req.file.path, { folder:'casa-elegida/productos' });
        fs.unlinkSync(req.file.path);
        res.json({ url: r.secure_url });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/subir-logo', upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error:'No se recibió imagen' });
        const r = await cloudinary.uploader.upload(req.file.path, { folder:'casa-elegida/logo' });
        fs.unlinkSync(req.file.path);
        setConfig('logo', r.secure_url);
        res.json({ success:true, url:r.secure_url });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/eliminar-logo', (req, res) => { try { setConfig('logo',''); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });

// ==================== CATEGORÍAS ====================
app.post('/listar-categorias', (req, res) => {
    try { res.json({ lista: db.prepare('SELECT * FROM categorias').all().map(c=>({...c,subcategorias:JSON.parse(c.subcategorias||'[]')})) }); } 
    catch(e) { res.status(500).json({ error:e.message }); }
});
app.post('/guardar-categoria', (req, res) => {
    try {
        const { id, nombre, subcategorias } = req.body;
        if (!nombre?.trim()) return res.status(400).json({ error:'Nombre requerido' });
        if (db.prepare('SELECT id FROM categorias WHERE id=?').get(id))
            db.prepare('UPDATE categorias SET nombre=?,subcategorias=? WHERE id=?').run(nombre.trim(),JSON.stringify(subcategorias||[]),id);
        else
            db.prepare('INSERT INTO categorias (id,nombre,subcategorias) VALUES (?,?,?)').run(id||Date.now(),nombre.trim(),JSON.stringify(subcategorias||[]));
        res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
});
app.post('/eliminar-categoria', (req, res) => { try { db.prepare('DELETE FROM categorias WHERE id=?').run(req.body.id); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });

// ==================== MÉTODOS DE ENVÍO ====================
app.post('/listar-metodos-envio', (req, res) => {
    try { res.json({ lista: db.prepare('SELECT nombre FROM metodos_envio').all().map(m=>m.nombre) }); } 
    catch(e) { res.status(500).json({ error:e.message }); }
});
app.post('/guardar-metodos-envio', (req, res) => {
    try { db.prepare('DELETE FROM metodos_envio').run(); (req.body.lista||[]).forEach(m => db.prepare('INSERT INTO metodos_envio (nombre) VALUES (?)').run(m)); res.json({ success:true }); } 
    catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== CONFIGURACIÓN ====================
app.post('/get-config', (req, res) => { try { res.json(getConfig()); } catch(e) { res.status(500).json({ error:e.message }); } });
app.post('/save-config', (req, res) => { try { ['empresa','horarios','redes','pagos'].forEach(k => { if(req.body[k]) setConfig(k, req.body[k]); }); logActividad('Admin','SAVE_CONFIG','Configuración general',req); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });
app.post('/save-tienda-config', (req, res) => { try { if(req.body.tienda) setConfig('tienda',req.body.tienda); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });
app.post('/save-mayorista-config', (req, res) => { try { setConfig('mayorista',req.body); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });
app.post('/save-diseno-config', (req, res) => { try { if(req.body.diseno) setConfig('diseno',req.body.diseno); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });
app.post('/save-home-config', (req, res) => { try { if(req.body.heroConfig) setConfig('heroConfig',req.body.heroConfig); if(req.body.seccionesDestacadas) setConfig('seccionesDestacadas',req.body.seccionesDestacadas); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });

// ==================== VENTAS ====================
app.post('/confirmar-venta', (req, res) => {
    try {
        const { carrito, pago, logistica, cliente, mayoristaConfig } = req.body;
        if (!carrito?.length) return res.status(400).json({ error:'Carrito vacío' });
        let cf = [...carrito], totalCalc = pago.total, esMay = false, razonMay = '';
        if (mayoristaConfig?.habilitado) {
            const { modo, valorCantidad=0, valorMonto=0 } = mayoristaConfig;
            const cantTotal = carrito.reduce((s,i)=>s+i.cant,0);
            let totalMay = 0;
            for (let it of carrito) { let pr = it.precio; if(!it.esManual){ const prod=db.prepare('SELECT * FROM productos WHERE id=?').get(it.pId); if(prod?.precioMayor>0) pr=prod.precioMayor; } totalMay+=pr*it.cant; }
            let cumple = modo==='cantidad'?cantTotal>=valorCantidad:modo==='monto'?totalMay>=valorMonto:cantTotal>=valorCantidad&&totalMay>=valorMonto;
            if (!cumple) return res.status(400).json({ error:'No cumple requisitos mayoristas' });
            esMay=true; razonMay='Mayorista por '+(modo==='cantidad'?'cantidad':modo==='monto'?'monto':'cantidad y monto');
            cf=[]; totalCalc=0;
            for (let it of carrito) { let pr=it.precio; if(!it.esManual){ const prod=db.prepare('SELECT * FROM productos WHERE id=?').get(it.pId); if(prod?.precioMayor>0) pr=prod.precioMayor; } cf.push({...it,precio:pr,precioOriginal:it.precio}); totalCalc+=pr*it.cant; }
        }
        for (let it of cf) { if(it.esManual) continue; db.prepare('UPDATE variantes SET stock=stock-? WHERE productoId=? AND nombre=?').run(it.cant,it.pId,it.vNom); }
        const id = 'FAC-'+Date.now();
        db.prepare("INSERT INTO ventas (id,fecha,fechaTimestamp,items,total,metodoPago,logistica,cliente,esMayorista,razonMayorista,estado,origen) VALUES (?,datetime('now','localtime'),?,?,?,?,?,?,?,?,'completada','admin')")
          .run(id,Date.now(),JSON.stringify(cf),totalCalc,pago.metodo,logistica,JSON.stringify(cliente||{nombre:'Mostrador'}),esMay?1:0,razonMay);
        crearNotificacion('venta','💰 Nueva venta',`Venta ${id} - ${fmt.format(totalCalc)}`);
        logActividad('Admin','VENTA',`Venta ${id} - ${fmt.format(totalCalc)}`,req);
        enviarWhatsAppAdmin({ id, items: cf, total: totalCalc, cliente: cliente || { nombre: 'Mostrador' }, metodoPago: pago.metodo }, 'venta_admin');
        res.json({ success:true, ventaId:id, esMayorista:esMay, razonMayorista:razonMay });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/listar-ventas', (req, res) => {
    try {
        const ventas = db.prepare('SELECT * FROM ventas ORDER BY fechaTimestamp DESC').all();
        res.json({ lista: ventas.map(v=>({...v,items:JSON.parse(v.items||'[]'),cliente:JSON.parse(v.cliente||'{}'),pago:{total:v.total,metodo:v.metodoPago},esMayorista:!!v.esMayorista})) });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/corte-caja', (req, res) => {
    try {
        const ventas = db.prepare("SELECT * FROM ventas WHERE date(fecha) = date('now','localtime')").all();
        res.json({ fecha: new Date().toLocaleDateString('es-AR'), total: ventas.reduce((s,v)=>s+v.total,0), cantidad: ventas.length });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== TIENDA ====================
app.post('/tienda/listar-productos', (req, res) => {
    try {
        const config = getConfig();
        const tienda = typeof config.tienda==='string'?JSON.parse(config.tienda):config.tienda;
        if (!tienda?.habilitada) return res.status(403).json({ error:'Tienda cerrada' });
        const prods = db.prepare('SELECT * FROM productos ORDER BY id DESC').all();
        const cats = db.prepare('SELECT * FROM categorias').all();
        const envios = db.prepare('SELECT nombre FROM metodos_envio').all();
        res.json({
            productos: prods.map(p=>({...p,variantes:db.prepare('SELECT * FROM variantes WHERE productoId=?').all(p.id)})),
            categorias: cats.map(c=>({...c,subcategorias:JSON.parse(c.subcategorias||'[]')})),
            metodosEnvio: envios.map(m=>m.nombre),
            configuracion: config
        });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/tienda/crear-pedido', authMiddleware, (req, res) => {
    try {
        const { carrito, cliente, total, esMayorista, razonMayorista, tipoEntrega, metodoEnvio } = req.body;
        if (!carrito?.length) return res.status(400).json({ error:'Carrito vacío' });
        const usuario = db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.usuario.id);
        if (!usuario) return res.status(401).json({ error:'Usuario no encontrado' });
        cliente.nombre = usuario.nombre; cliente.apellido = usuario.apellido; cliente.email = usuario.email; cliente.dni = usuario.dni||'';
        if (!cliente.telefono) cliente.telefono = usuario.telefono||'';
        for (let it of carrito) { if(it.esManual) continue; db.prepare('UPDATE variantes SET stock=stock-? WHERE productoId=? AND nombre=?').run(it.cant,it.pId,it.vNom); }
        const id = 'PED-'+Date.now();
        db.prepare("INSERT INTO pedidos (id,fecha,fechaTimestamp,items,total,cliente,tipoEntrega,metodoEnvio,esMayorista,razonMayorista,estado,origen,usuarioId) VALUES (?,datetime('now','localtime'),?,?,?,?,?,?,?,?,'pendiente','tienda',?)")
          .run(id,Date.now(),JSON.stringify(carrito),total,JSON.stringify(cliente),tipoEntrega,metodoEnvio,esMayorista?1:0,razonMayorista||'',usuario.id);
        crearNotificacion('pedido','🛍️ Nuevo pedido web',`Pedido #${id} - ${cliente.nombre} ${cliente.apellido}`);
        logActividad(cliente.nombre,'PEDIDO_WEB',`Pedido ${id}`,req);
        enviarEmail(cliente.email,`Pedido #${id} recibido - Casa Elegida`,`<h1>Casa Elegida</h1><h2>Pedido #${id}</h2><p>Total: ${fmt.format(total)}</p><p>Estado: Pendiente</p>`);
        enviarWhatsAppAdmin({ id, items: carrito, total, cliente, tipoEntrega }, 'nuevo_pedido');
        res.json({ success:true, pedidoId:id });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/tienda/listar-pedidos', (req, res) => {
    try {
        const pedidos = db.prepare('SELECT * FROM pedidos ORDER BY fechaTimestamp DESC').all();
        res.json({ lista: pedidos.map(p=>({...p,items:JSON.parse(p.items||'[]'),cliente:JSON.parse(p.cliente||'{}'),esMayorista:!!p.esMayorista})) });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/tienda/confirmar-pedido', (req, res) => {
    try {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id=? AND estado=?').get(req.body.pedidoId,'pendiente');
        if (!pedido) return res.status(400).json({ error:'Pedido no válido' });
        const pin = generarPIN(), ventaId = 'FAC-'+Date.now();
        db.prepare("INSERT INTO ventas (id,fecha,fechaTimestamp,items,total,metodoPago,logistica,cliente,esMayorista,estado,origen,pedidoId) VALUES (?,datetime('now','localtime'),?,?,?,'pedido_online',?,?,?,'completada','tienda',?)")
          .run(ventaId,Date.now(),pedido.items,pedido.total,pedido.tipoEntrega==='envio'?'envio':'local',pedido.cliente,pedido.esMayorista,pedido.id);
        db.prepare('UPDATE pedidos SET estado=?,pin=?,ventaId=? WHERE id=?').run('confirmado',pin,ventaId,pedido.id);
        const cli = JSON.parse(pedido.cliente||'{}');
        if (cli.email) enviarEmail(cli.email,`Pedido #${pedido.id} confirmado`,`<h1>Casa Elegida</h1><h2>¡Pedido confirmado!</h2>${pedido.tipoEntrega==='local'?`<p>PIN de retiro: <strong>${pin}</strong></p>`:'<p>Pronto despacharemos.</p>'}`);
        logActividad('Admin','CONFIRMAR_PEDIDO',`Pedido ${pedido.id} - PIN: ${pin}`,req);
        res.json({ success:true, ventaId, pin });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/tienda/cancelar-pedido', authMiddleware, (req, res) => {
    try {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id=? AND usuarioId=? AND estado=?').get(req.body.pedidoId,req.usuario.id,'pendiente');
        if (!pedido) return res.status(400).json({ error:'No se puede cancelar' });
        JSON.parse(pedido.items||'[]').forEach(it => { if(!it.esManual) db.prepare('UPDATE variantes SET stock=stock+? WHERE productoId=? AND nombre=?').run(it.cant,it.pId,it.vNom); });
        db.prepare("UPDATE pedidos SET estado='cancelado', fechaCancelado=datetime('now') WHERE id=?").run(pedido.id);
        res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/tienda/marcar-abonado', (req, res) => { try { db.prepare("UPDATE pedidos SET estado='abonado',fechaAbonado=datetime('now') WHERE id=?").run(req.body.pedidoId); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });
app.post('/tienda/marcar-enviado', (req, res) => { try { db.prepare("UPDATE pedidos SET estado='enviado',fechaEnviado=datetime('now') WHERE id=?").run(req.body.pedidoId); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });
app.post('/tienda/marcar-entregado', (req, res) => { try { db.prepare("UPDATE pedidos SET estado='entregado',fechaEntregado=datetime('now') WHERE id=?").run(req.body.pedidoId); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });
app.post('/tienda/cancelar-pedido-admin', (req, res) => {
    try {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id=?').get(req.body.pedidoId);
        if (!pedido) return res.status(400).json({ error:'No encontrado' });
        JSON.parse(pedido.items||'[]').forEach(it => { if(!it.esManual) db.prepare('UPDATE variantes SET stock=stock+? WHERE productoId=? AND nombre=?').run(it.cant,it.pId,it.vNom); });
        db.prepare("UPDATE pedidos SET estado='cancelado',fechaCancelado=datetime('now') WHERE id=?").run(pedido.id);
        res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/tienda/retirar-pedido', (req, res) => {
    try {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id=? AND pin=?').get(req.body.pedidoId,req.body.pin);
        if (!pedido) return res.status(400).json({ error:'PIN incorrecto' });
        db.prepare("UPDATE pedidos SET estado='entregado',fechaEntregado=datetime('now') WHERE id=?").run(pedido.id);
        res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/tienda/verificar-pin', (req, res) => {
    try {
        const pedido = db.prepare("SELECT * FROM pedidos WHERE pin=? AND estado IN ('confirmado','abonado')").get(req.body.pin);
        if (!pedido) return res.status(400).json({ error:'PIN no encontrado' });
        res.json({ success:true, pedido:{...pedido,cliente:JSON.parse(pedido.cliente||'{}'),items:JSON.parse(pedido.items||'[]')} });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== DASHBOARD ====================
app.post('/dashboard/stats', (req, res) => {
    try {
        const ahora = new Date();
        const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
        const ventasHoy = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total FROM ventas WHERE fechaTimestamp >= ?').get(inicioHoy);
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();
        const ventasMes = db.prepare('SELECT COALESCE(SUM(total),0) as total FROM ventas WHERE fechaTimestamp >= ?').get(inicioMes);
        const totalVentas = db.prepare('SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM ventas').get();
        const clientesNuevos = db.prepare("SELECT COUNT(*) as count FROM usuarios WHERE fechaRegistro >= datetime('now','start of month')").get();
        const ventasSemana = [];
        for (let i=6; i>=0; i--) {
            const dia = new Date(ahora); dia.setDate(dia.getDate()-i);
            const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate()).getTime();
            const v = db.prepare('SELECT COALESCE(SUM(total),0) as total FROM ventas WHERE fechaTimestamp >= ? AND fechaTimestamp < ?').get(inicio, inicio+86400000);
            ventasSemana.push({ dia: dia.toLocaleDateString('es-AR',{weekday:'short'}), total: v.total });
        }
        const ventas = db.prepare('SELECT items FROM ventas').all();
        const prodCount = {};
        ventas.forEach(v => { JSON.parse(v.items||'[]').forEach(i => { prodCount[i.pNom] = (prodCount[i.pNom]||0) + i.cant; }); });
        const topProd = Object.entries(prodCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>({nombre:n,cantidad:c}));
        res.json({ ventasHoy: ventasHoy.count, totalHoy: ventasHoy.total, ticketPromedio: totalVentas.count>0?Math.round(totalVentas.total/totalVentas.count):0, clientesNuevos: clientesNuevos.count, ventasSemana, productosTop: topProd, clientesTop:[], horariosPico:[] });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== ESTADÍSTICAS AVANZADAS ====================
app.post('/admin/estadisticas-avanzadas', adminMiddleware('dashboard'), (req, res) => {
    try {
        const ahora = new Date();
        const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();
        const ventasHoy = db.prepare('SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM ventas WHERE fechaTimestamp >= ?').get(inicioHoy);
        const ventasMes = db.prepare('SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM ventas WHERE fechaTimestamp >= ?').get(inicioMes);
        const totalVentas = db.prepare('SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM ventas').get();
        const totalClientes = db.prepare('SELECT COUNT(*) as count FROM usuarios WHERE rol = ?').get('cliente');
        const totalProductos = db.prepare('SELECT COUNT(*) as count FROM productos').get();
        const totalVariantes = db.prepare('SELECT COUNT(*) as count FROM variantes').get();
        const pedidosPendientes = db.prepare("SELECT COUNT(*) as count FROM pedidos WHERE estado IN ('pendiente','confirmado','abonado')").get();
        const agotados = db.prepare('SELECT COUNT(DISTINCT productoId) as count FROM variantes WHERE stock = 0').get();
        const ventasPorDia = [];
        for (let i=29; i>=0; i--) {
            const dia = new Date(ahora); dia.setDate(dia.getDate()-i);
            const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate()).getTime();
            const v = db.prepare('SELECT COALESCE(SUM(total),0) as total FROM ventas WHERE fechaTimestamp >= ? AND fechaTimestamp < ?').get(inicio, inicio+86400000);
            ventasPorDia.push({ fecha: dia.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}), total: v.total });
        }
        const todasVentas = db.prepare('SELECT items FROM ventas').all();
        const prodCount = {};
        todasVentas.forEach(v => { JSON.parse(v.items||'[]').forEach(i => { prodCount[i.pNom] = (prodCount[i.pNom]||0) + i.cant; }); });
        const topProd = Object.entries(prodCount).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([n,c])=>({nombre:n, cantidad:c}));
        const pagos = db.prepare("SELECT metodoPago, COUNT(*) as count, COALESCE(SUM(total),0) as total FROM ventas WHERE fechaTimestamp >= ? GROUP BY metodoPago").all(inicioMes);
        res.json({
            ventasHoy: ventasHoy.total, cantidadHoy: ventasHoy.count,
            ventasMes: ventasMes.total, cantidadMes: ventasMes.count,
            totalVentas: totalVentas.total, cantidadVentas: totalVentas.count,
            ticketPromedio: totalVentas.count>0?Math.round(totalVentas.total/totalVentas.count):0,
            totalClientes: totalClientes.count,
            totalProductos: totalProductos.count,
            totalVariantes: totalVariantes.count,
            pedidosPendientes: pedidosPendientes.count,
            productosAgotados: agotados.count,
            ventasPorDia, productosTop: topProd, metodosPago: pagos, horariosPico: []
        });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== BUSCADOR DE CLIENTES ====================
app.post('/admin/buscar-clientes', adminMiddleware(), (req, res) => {
    try {
        const { query } = req.body;
        if (!query || query.length < 2) return res.json({ lista: [] });
        const q = `%${query}%`;
        const clientes = db.prepare('SELECT id, nombre, apellido, email, telefono, dni, fechaRegistro FROM usuarios WHERE nombre LIKE ? OR apellido LIKE ? OR email LIKE ? OR dni LIKE ? OR telefono LIKE ? LIMIT 20').all(q,q,q,q,q);
        res.json({ lista: clientes });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== EXPORTAR VENTAS ====================
app.post('/admin/exportar-ventas', adminMiddleware(), (req, res) => {
    try {
        const ventas = db.prepare('SELECT * FROM ventas ORDER BY fechaTimestamp DESC').all();
        let csv = '\uFEFFFecha;ID;Cliente;DNI;Productos;Total;Pago;Mayorista\n';
        ventas.forEach(v => {
            const cliente = JSON.parse(v.cliente||'{}');
            const items = JSON.parse(v.items||'[]');
            csv += `"${v.fecha}";"${v.id}";"${cliente.nombre||'Mostrador'} ${cliente.apellido||''}";"${cliente.dni||''}";"${items.map(i=>i.pNom+' x'+i.cant).join(' | ')}";"${v.total}";"${v.metodoPago}";"${v.esMayorista?'Sí':'No'}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=ventas_casa_elegida.csv');
        res.send(csv);
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== CAJA DIARIA ====================
app.post('/admin/apertura-caja', adminMiddleware('ventas'), (req, res) => {
    try {
        const { montoInicial } = req.body;
        const hoy = new Date().toLocaleDateString('es-AR');
        const existe = db.prepare("SELECT * FROM caja_diaria WHERE fecha = ?").get(hoy);
        if (existe) return res.status(400).json({ error: 'La caja ya fue abierta hoy' });
        db.prepare("INSERT INTO caja_diaria (fecha, montoInicial, abiertaPor, estado, aperturaTimestamp) VALUES (?, ?, ?, 'abierta', ?)")
          .run(hoy, montoInicial||0, req.admin.nombre, Date.now());
        logActividad(req.admin.nombre, 'APERTURA_CAJA', `Monto inicial: ${fmt.format(montoInicial||0)}`, req);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/admin/cierre-caja', adminMiddleware('ventas'), (req, res) => {
    try {
        const hoy = new Date().toLocaleDateString('es-AR');
        const caja = db.prepare("SELECT * FROM caja_diaria WHERE fecha = ? AND estado = 'abierta'").get(hoy);
        if (!caja) return res.status(400).json({ error: 'No hay caja abierta hoy' });
        const ventasHoy = db.prepare("SELECT * FROM ventas WHERE date(fecha) = date('now','localtime')").all();
        const totalVentas = ventasHoy.reduce((s,v) => s+v.total, 0);
        const porMetodo = { efectivo:0, transferencia:0, mixto:0, pedido_online:0 };
        ventasHoy.forEach(v => { if (porMetodo[v.metodoPago] !== undefined) porMetodo[v.metodoPago] += v.total; });
        db.prepare("UPDATE caja_diaria SET estado='cerrada', cerradaPor=?, cierreTimestamp=?, totalVentas=?, totalEsperado=?, detallePagos=? WHERE fecha=?")
          .run(req.admin.nombre, Date.now(), totalVentas, caja.montoInicial+totalVentas, JSON.stringify(porMetodo), hoy);
        logActividad(req.admin.nombre, 'CIERRE_CAJA', `Total: ${fmt.format(totalVentas)}`, req);
        res.json({ success:true, resumen:{ montoInicial:caja.montoInicial, totalVentas, totalEsperado:caja.montoInicial+totalVentas, cantidadVentas:ventasHoy.length, porMetodo } });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/admin/estado-caja', adminMiddleware('ventas'), (req, res) => {
    try {
        const hoy = new Date().toLocaleDateString('es-AR');
        const caja = db.prepare("SELECT * FROM caja_diaria WHERE fecha = ?").get(hoy);
        if (!caja) return res.json({ abierta:false });
        const ventasHoy = db.prepare("SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM ventas WHERE date(fecha) = date('now','localtime')").get();
        res.json({ abierta: caja.estado==='abierta', estado: caja.estado, montoInicial: caja.montoInicial, abiertaPor: caja.abiertaPor, totalVentas: ventasHoy.total, cantidadVentas: ventasHoy.count });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== ESTADÍSTICAS POR VENDEDOR ====================
app.post('/admin/estadisticas-vendedor', adminMiddleware('dashboard'), (req, res) => {
    try {
        const logs = db.prepare("SELECT admin, accion, COUNT(*) as count FROM logs_admin WHERE accion IN ('VENTA','CONFIRMAR_PEDIDO') GROUP BY admin").all();
        const vendedores = {};
        logs.forEach(l => {
            if (!vendedores[l.admin]) vendedores[l.admin] = { nombre: l.admin, ventas:0, pedidos:0 };
            if (l.accion==='VENTA') vendedores[l.admin].ventas += l.count;
            if (l.accion==='CONFIRMAR_PEDIDO') vendedores[l.admin].pedidos += l.count;
        });
        res.json({ lista: Object.values(vendedores).sort((a,b)=>(b.ventas+b.pedidos)-(a.ventas+a.pedidos)) });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== NOTIFICACIONES ====================
app.post('/notificaciones', (req, res) => { try { res.json({ lista: db.prepare('SELECT * FROM notificaciones ORDER BY fecha DESC LIMIT 50').all() }); } catch(e) { res.status(500).json({ error:e.message }); } });
app.post('/notificaciones/leer', (req, res) => { try { db.prepare('UPDATE notificaciones SET leida=1 WHERE id=?').run(req.body.id); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });
app.post('/notificaciones/leer-todas', (req, res) => { try { db.prepare('UPDATE notificaciones SET leida=1').run(); res.json({ success:true }); } catch(e) { res.status(500).json({ error:e.message }); } });

// ==================== LOGS ====================
app.post('/logs/admin', (req, res) => {
    try { res.json({ lista: db.prepare('SELECT * FROM logs_admin ORDER BY fecha DESC LIMIT 200').all() }); } 
    catch(e) { res.status(500).json({ error:e.message }); }
});

// ==================== MIS PEDIDOS ====================
app.get('/api/mis-pedidos', authMiddleware, (req, res) => {
    try {
        const pedidos = db.prepare('SELECT * FROM pedidos WHERE usuarioId=? ORDER BY fechaTimestamp DESC').all(req.usuario.id);
        res.json({ lista: pedidos.map(p=>({...p,items:JSON.parse(p.items||'[]'),cliente:JSON.parse(p.cliente||'{}')})) });
    } catch(e) { res.status(500).json({ error:e.message }); }
});

// Verificar stock bajo cada 2 horas
function verificarStockBajoYNotificar() {
    try {
        const bajo = db.prepare('SELECT v.*, p.nombre as productoNombre FROM variantes v JOIN productos p ON v.productoId=p.id WHERE v.stock <= 3').all();
        if (bajo.length > 0) {
            const nombres = [...new Set(bajo.map(b => b.productoNombre))].slice(0,5).join(', ');
            crearNotificacion('stock', '⚠️ Stock bajo', `${bajo.length} variantes con stock crítico: ${nombres}...`);
        }
    } catch(e) {}
}
setInterval(verificarStockBajoYNotificar, 2 * 60 * 60 * 1000);

// Error handling
app.use((req, res) => res.status(404).json({ error:'Ruta no encontrada' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error:'Error interno' }); });

app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║     🏪 CASA ELEGIDA - SISTEMA ACTIVO              ║`);
    console.log(`╠══════════════════════════════════════════════════╣`);
    console.log(`║  Tienda : http://localhost:${PORT}/tienda           ║`);
    console.log(`║  Admin  : http://localhost:${PORT}/admin            ║`);
    console.log(`║  Login  : http://localhost:${PORT}/login            ║`);
    console.log(`╚══════════════════════════════════════════════════╝\n`);
});

process.on('SIGTERM', () => { db.close(); process.exit(0); });
process.on('SIGINT', () => { db.close(); process.exit(0); });

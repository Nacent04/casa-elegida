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
`);

// Insertar configuración por defecto si no existe
const configInicial = {
    logo: '',
    empresa: JSON.stringify({ nombre: "Casa Elegida", telefono: "", email: "casaelegida20@gmail.com", direccion: "" }),
    horarios: JSON.stringify({ lunesViernes: "9:00 - 13:00 y 17:00 - 20:00", sabados: "9:00 - 13:00", domingos: "Cerrado" }),
    redes: JSON.stringify({ instagram: "", instagramUrl: "", facebook: "", facebookUrl: "", tiktok: "", tiktokUrl: "", whatsapp: "", whatsappUrl: "" }),
    pagos: JSON.stringify({ alias: "", cbu: "", banco: "", titular: "" }),
    mayorista: JSON.stringify({ habilitado: false, modo: "cantidad", valorCantidad: 3, valorMonto: 80000 }),
    tienda: JSON.stringify({ habilitada: true, titulo: "Casa Elegida", mensajeBienvenida: "Calidad y confort para tu hogar", retiroLocal: true }),
    diseno: JSON.stringify({ colorPrimario: "#8B5E3C", colorSecundario: "#D4A574", colorFondo: "#FDF8F4", colorTexto: "#3E2A1E" }),
    registroObligatorio: 'true',
    heroConfig: JSON.stringify({ titulo: "Casa Elegida", subtitulo: "Toallones, sábanas, mantas y más", badge: "¡Precios especiales por cantidad!" }),
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

// ==================== CONFIGURACIÓN DE CLOUDINARY ====================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ==================== CONFIGURACIÓN DE EMAIL ====================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Crear directorios necesarios
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads', { recursive: true });
if (!fs.existsSync('./backups')) fs.mkdirSync('./backups', { recursive: true });
if (!fs.existsSync('./public')) fs.mkdirSync('./public', { recursive: true });

// Configuración de multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, GIF, WEBP)'));
    }
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({ 
    secret: SESSION_SECRET, 
    resave: false, 
    saveUninitialized: false, 
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } 
}));
app.use(passport.initialize());
app.use(passport.session());
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Passport Google OAuth
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(profile.emails[0].value);
        if (!usuario) {
            const id = 'USR-' + Date.now();
            db.prepare(`INSERT INTO usuarios (id, nombre, apellido, email, googleId, foto, rol) VALUES (?, ?, ?, ?, ?, ?, 'cliente')`)
              .run(id, profile.name.givenName || '', profile.name.familyName || '', profile.emails[0].value, profile.id, profile.photos?.[0]?.value || '');
            usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
        }
        return done(null, usuario);
    } catch (e) { return done(e, null); }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    done(null, user || null);
});

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No autorizado. Iniciá sesión.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

// ==================== FUNCIONES HELPERS ====================
function generarPIN() { return Math.floor(1000 + Math.random() * 9000).toString(); }

function crearNotificacion(tipo, titulo, descripcion) {
    db.prepare('INSERT INTO notificaciones (id, tipo, titulo, descripcion, fecha, leida) VALUES (?, ?, ?, ?, datetime(\'now\'), 0)')
      .run('NOTIF-' + Date.now(), tipo, titulo, descripcion);
}

async function enviarEmail(destinatario, asunto, html) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return false;
    try {
        const config = getConfig();
        const empresa = typeof config.empresa === 'string' ? JSON.parse(config.empresa) : config.empresa;
        await transporter.sendMail({ 
            from: `"${empresa?.nombre || 'Casa Elegida'}" <${process.env.EMAIL_USER}>`, 
            to: destinatario, subject: asunto, html 
        });
        return true;
    } catch (e) { return false; }
}

// ==================== RUTAS PRINCIPALES ====================
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/tienda', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tienda.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/registro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'registro.html')));
app.get('/perfil', (req, res) => res.sendFile(path.join(__dirname, 'public', 'perfil.html')));
app.get('/recuperar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'recuperar.html')));
app.get('/mis-pedidos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'mis-pedidos.html')));
app.get('/', (req, res) => res.redirect('/tienda'));

// Auth con Google
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    const token = jwt.sign({ id: req.user.id, email: req.user.email, nombre: req.user.nombre, rol: req.user.rol }, JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`/tienda?token=${token}`);
});

// ==================== AUTENTICACIÓN ====================
app.post('/auth/registro', async (req, res) => {
    try {
        const { nombre, apellido, email, dni, telefono, password } = req.body;
        if (!nombre || !apellido || !email || !dni || !password) 
            return res.status(400).json({ error: 'Todos los campos son requeridos (incluyendo DNI)' });
        
        const existeEmail = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
        if (existeEmail) return res.status(400).json({ error: 'El email ya está registrado' });
        
        const existeDni = db.prepare('SELECT id FROM usuarios WHERE dni = ?').get(dni);
        if (existeDni) return res.status(400).json({ error: 'El DNI ya está registrado' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const id = 'USR-' + Date.now();
        db.prepare('INSERT INTO usuarios (id, nombre, apellido, email, dni, telefono, password, rol) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, nombre, apellido, email, dni, telefono || '', hashedPassword, 'cliente');
        
        const token = jwt.sign({ id, email, nombre, rol: 'cliente' }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, usuario: { id, nombre, apellido, email, dni } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
        if (!usuario || !usuario.password) return res.status(401).json({ error: 'Credenciales inválidas' });
        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });
        const token = jwt.sign({ id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido, email: usuario.email, dni: usuario.dni } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/recuperar', async (req, res) => {
    try {
        const { email } = req.body;
        const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
        if (!usuario) return res.status(404).json({ error: 'Email no encontrado' });
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        db.prepare('UPDATE usuarios SET resetPin = ?, resetPinExpires = ? WHERE id = ?')
          .run(pin, Date.now() + 3600000, usuario.id);
        await enviarEmail(email, 'Recuperación de contraseña - Casa Elegida', `
            <h1>Casa Elegida</h1>
            <h2>Recuperación de contraseña</h2>
            <p>Tu PIN de recuperación es: <strong>${pin}</strong></p>
            <p>Expira en 1 hora.</p>
        `);
        res.json({ success: true, message: 'Se ha enviado un PIN a tu email' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/reset-password', async (req, res) => {
    try {
        const { email, pin, newPassword } = req.body;
        const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
        if (!usuario || usuario.resetPin !== pin || usuario.resetPinExpires < Date.now())
            return res.status(400).json({ error: 'PIN inválido o expirado' });
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE usuarios SET password = ?, resetPin = NULL, resetPinExpires = NULL WHERE id = ?')
          .run(hashedPassword, usuario.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/auth/me', authMiddleware, (req, res) => {
    const usuario = db.prepare('SELECT id, nombre, apellido, email, telefono, dni, foto FROM usuarios WHERE id = ?').get(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(usuario);
});

app.post('/auth/update-profile', authMiddleware, async (req, res) => {
    try {
        const { telefono } = req.body;
        db.prepare('UPDATE usuarios SET telefono = ? WHERE id = ?')
          .run(telefono || '', req.usuario.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PRODUCTOS ====================
app.post('/listar', (req, res) => {
    try {
        const productos = db.prepare('SELECT * FROM productos ORDER BY id DESC').all();
        const result = productos.map(p => {
            const variantes = db.prepare('SELECT * FROM variantes WHERE productoId = ?').all(p.id);
            return { ...p, variantes };
        });
        res.json({ lista: result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/guardar-producto', (req, res) => {
    try {
        const p = req.body;
        if (!p.nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
        if (p.precio <= 0) return res.status(400).json({ error: 'Precio debe ser mayor a 0' });
        
        const existe = db.prepare('SELECT id FROM productos WHERE id = ?').get(p.id);
        if (existe) {
            db.prepare('UPDATE productos SET nombre = ?, precio = ?, precioMayor = ?, descripcion = ?, categoriaId = ?, subcategoria = ? WHERE id = ?')
              .run(p.nombre, p.precio, p.precioMayor || 0, p.descripcion || '', p.categoriaId || null, p.subcategoria || '', p.id);
            db.prepare('DELETE FROM variantes WHERE productoId = ?').run(p.id);
        } else {
            db.prepare('INSERT INTO productos (id, nombre, precio, precioMayor, descripcion, categoriaId, subcategoria) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(p.id, p.nombre, p.precio, p.precioMayor || 0, p.descripcion || '', p.categoriaId || null, p.subcategoria || '');
        }
        
        if (p.variantes?.length) {
            const insertVar = db.prepare('INSERT INTO variantes (productoId, nombre, stock, foto) VALUES (?, ?, ?, ?)');
            p.variantes.forEach(v => {
                insertVar.run(p.id, v.nombre, v.stock || 0, v.foto || '');
            });
        }
        
        res.json({ success: true, producto: p });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/eliminar-producto', (req, res) => {
    try {
        db.prepare('DELETE FROM productos WHERE id = ?').run(req.body.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/reordenar-productos', (req, res) => {
    res.json({ success: true });
});

app.post('/stock-bajo', (req, res) => {
    try {
        const minimo = req.body.minimo || 5;
        const variantes = db.prepare('SELECT v.*, p.nombre as productoNombre FROM variantes v JOIN productos p ON v.productoId = p.id WHERE v.stock <= ?').all(minimo);
        res.json({ stockBajo: variantes });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== IMÁGENES ====================
app.post('/subir-imagen', upload.single('foto'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
        const result = await cloudinary.uploader.upload(req.file.path, { folder: 'casa-elegida/productos' });
        fs.unlinkSync(req.file.path);
        res.json({ url: result.secure_url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/subir-logo', upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
        const result = await cloudinary.uploader.upload(req.file.path, { folder: 'casa-elegida/logo' });
        fs.unlinkSync(req.file.path);
        setConfig('logo', result.secure_url);
        res.json({ success: true, url: result.secure_url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/eliminar-logo', (req, res) => {
    try { setConfig('logo', ''); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CATEGORÍAS ====================
app.post('/listar-categorias', (req, res) => {
    try {
        const categorias = db.prepare('SELECT * FROM categorias').all();
        const result = categorias.map(c => ({ ...c, subcategorias: JSON.parse(c.subcategorias || '[]') }));
        res.json({ lista: result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/guardar-categoria', (req, res) => {
    try {
        const { id, nombre, subcategorias } = req.body;
        if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
        const existe = db.prepare('SELECT id FROM categorias WHERE id = ?').get(id);
        if (existe) {
            db.prepare('UPDATE categorias SET nombre = ?, subcategorias = ? WHERE id = ?')
              .run(nombre.trim(), JSON.stringify(subcategorias || []), id);
        } else {
            db.prepare('INSERT INTO categorias (id, nombre, subcategorias) VALUES (?, ?, ?)')
              .run(id || Date.now(), nombre.trim(), JSON.stringify(subcategorias || []));
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/eliminar-categoria', (req, res) => {
    try { db.prepare('DELETE FROM categorias WHERE id = ?').run(req.body.id); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== MÉTODOS DE ENVÍO ====================
app.post('/listar-metodos-envio', (req, res) => {
    try {
        const metodos = db.prepare('SELECT nombre FROM metodos_envio').all();
        res.json({ lista: metodos.map(m => m.nombre) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/guardar-metodos-envio', (req, res) => {
    try {
        const { lista } = req.body;
        db.prepare('DELETE FROM metodos_envio').run();
        const insert = db.prepare('INSERT INTO metodos_envio (nombre) VALUES (?)');
        (lista || []).forEach(m => insert.run(m));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CONFIGURACIÓN ====================
app.post('/get-config', (req, res) => {
    try { res.json(getConfig()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/save-config', (req, res) => {
    try {
        const { empresa, horarios, redes, pagos } = req.body;
        if (empresa) setConfig('empresa', empresa);
        if (horarios) setConfig('horarios', horarios);
        if (redes) setConfig('redes', redes);
        if (pagos) setConfig('pagos', pagos);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/save-tienda-config', (req, res) => {
    try { 
        if (req.body.tienda) setConfig('tienda', req.body.tienda); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/save-mayorista-config', (req, res) => {
    try {
        setConfig('mayorista', req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/save-diseno-config', (req, res) => {
    try { 
        if (req.body.diseno) setConfig('diseno', req.body.diseno); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/save-home-config', (req, res) => {
    try {
        if (req.body.heroConfig) setConfig('heroConfig', req.body.heroConfig);
        if (req.body.seccionesDestacadas) setConfig('seccionesDestacadas', req.body.seccionesDestacadas);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== VENTAS ====================
app.post('/confirmar-venta', (req, res) => {
    try {
        const { carrito, pago, logistica, cliente, mayoristaConfig } = req.body;
        if (!carrito?.length) return res.status(400).json({ error: 'Carrito vacío' });
        
        let carritoFinal = [...carrito];
        let totalVentaCalculado = pago.total;
        let esMayorista = false, razonMayorista = '';
        
        if (mayoristaConfig?.habilitado) {
            const { modo, valorCantidad = 0, valorMonto = 0 } = mayoristaConfig;
            const cantidadTotal = carrito.reduce((s, i) => s + i.cant, 0);
            let totalConMayorista = 0;
            
            for (let item of carrito) {
                let precio = item.precio;
                if (!item.esManual) {
                    const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(item.pId);
                    if (prod?.precioMayor > 0) precio = prod.precioMayor;
                }
                totalConMayorista += precio * item.cant;
            }
            
            let cumple = false;
            if (modo === 'cantidad') { cumple = cantidadTotal >= valorCantidad; razonMayorista = 'Mayorista por cantidad'; }
            else if (modo === 'monto') { cumple = totalConMayorista >= valorMonto; razonMayorista = 'Mayorista por monto'; }
            else { cumple = cantidadTotal >= valorCantidad && totalConMayorista >= valorMonto; razonMayorista = 'Mayorista por cantidad y monto'; }
            
            if (!cumple) return res.status(400).json({ error: 'No cumple requisitos mayoristas' });
            
            esMayorista = true;
            carritoFinal = [];
            totalVentaCalculado = 0;
            for (let item of carrito) {
                let precio = item.precio;
                if (!item.esManual) {
                    const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(item.pId);
                    if (prod?.precioMayor > 0) precio = prod.precioMayor;
                }
                carritoFinal.push({ ...item, precio, precioOriginal: item.precio });
                totalVentaCalculado += precio * item.cant;
            }
        }
        
        // Descontar stock
        for (let item of carritoFinal) {
            if (item.esManual) continue;
            db.prepare('UPDATE variantes SET stock = stock - ? WHERE productoId = ? AND nombre = ?')
              .run(item.cant, item.pId, item.vNom);
        }
        
        const id = 'FAC-' + Date.now();
        db.prepare(`INSERT INTO ventas (id, fecha, fechaTimestamp, items, total, metodoPago, logistica, cliente, esMayorista, razonMayorista, estado, origen)
            VALUES (?, datetime('now','localtime'), ?, ?, ?, ?, ?, ?, ?, ?, 'completada', 'admin')`)
          .run(id, Date.now(), JSON.stringify(carritoFinal), totalVentaCalculado, pago.metodo, logistica, JSON.stringify(cliente || { nombre: 'Mostrador' }), esMayorista ? 1 : 0, razonMayorista);
        
        crearNotificacion('venta', '💰 Nueva venta', `Venta ${id} - ${fmt.format(totalVentaCalculado)}`);
        res.json({ success: true, ventaId: id, esMayorista, razonMayorista });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/listar-ventas', (req, res) => {
    try {
        const ventas = db.prepare('SELECT * FROM ventas ORDER BY fechaTimestamp DESC').all();
        const result = ventas.map(v => ({
            ...v,
            items: JSON.parse(v.items || '[]'),
            cliente: JSON.parse(v.cliente || '{}'),
            pago: { total: v.total, metodo: v.metodoPago },
            esMayorista: !!v.esMayorista
        }));
        res.json({ lista: result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/corte-caja', (req, res) => {
    try {
        const hoy = new Date().toLocaleDateString('es-AR');
        const ventas = db.prepare("SELECT * FROM ventas WHERE date(fecha) = date('now','localtime')").all();
        const total = ventas.reduce((s, v) => s + v.total, 0);
        res.json({ fecha: hoy, total, cantidad: ventas.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== TIENDA ====================
app.post('/tienda/listar-productos', (req, res) => {
    try {
        const config = getConfig();
        const tienda = typeof config.tienda === 'string' ? JSON.parse(config.tienda) : config.tienda;
        if (!tienda?.habilitada) return res.status(403).json({ error: 'Tienda cerrada' });
        
        const productos = db.prepare('SELECT * FROM productos ORDER BY id DESC').all();
        const result = productos.map(p => {
            const variantes = db.prepare('SELECT * FROM variantes WHERE productoId = ?').all(p.id);
            return { ...p, variantes };
        });
        
        const categorias = db.prepare('SELECT * FROM categorias').all();
        const catsResult = categorias.map(c => ({ ...c, subcategorias: JSON.parse(c.subcategorias || '[]') }));
        
        const metodosEnvio = db.prepare('SELECT nombre FROM metodos_envio').all();
        
        res.json({
            productos: result,
            categorias: catsResult,
            metodosEnvio: metodosEnvio.map(m => m.nombre),
            configuracion: config
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tienda/crear-pedido', authMiddleware, (req, res) => {
    try {
        const { carrito, cliente, total, esMayorista, razonMayorista, tipoEntrega, metodoEnvio } = req.body;
        if (!carrito?.length) return res.status(400).json({ error: 'Carrito vacío' });
        
        const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
        if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado' });
        
        // Forzar datos del perfil (no editables)
        cliente.nombre = usuario.nombre;
        cliente.apellido = usuario.apellido;
        cliente.email = usuario.email;
        cliente.dni = usuario.dni || '';
        if (!cliente.telefono) cliente.telefono = usuario.telefono || '';
        
        // Descontar stock
        for (let item of carrito) {
            if (item.esManual) continue;
            db.prepare('UPDATE variantes SET stock = stock - ? WHERE productoId = ? AND nombre = ?')
              .run(item.cant, item.pId, item.vNom);
        }
        
        const id = 'PED-' + Date.now();
        db.prepare(`INSERT INTO pedidos (id, fecha, fechaTimestamp, items, total, cliente, tipoEntrega, metodoEnvio, esMayorista, razonMayorista, estado, origen, usuarioId)
            VALUES (?, datetime('now','localtime'), ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', 'tienda', ?)`)
          .run(id, Date.now(), JSON.stringify(carrito), total, JSON.stringify(cliente), tipoEntrega, metodoEnvio, esMayorista ? 1 : 0, razonMayorista || '', usuario.id);
        
        crearNotificacion('pedido', '🛍️ Nuevo pedido web', `Pedido #${id} - ${cliente.nombre} ${cliente.apellido}`);
        enviarEmail(cliente.email, `Pedido #${id} recibido`, `<h1>Casa Elegida</h1><h2>Pedido #${id}</h2><p>Total: ${fmt.format(total)}</p><p>Estado: Pendiente</p>`);
        
        res.json({ success: true, pedidoId: id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tienda/listar-pedidos', (req, res) => {
    try {
        const pedidos = db.prepare('SELECT * FROM pedidos ORDER BY fechaTimestamp DESC').all();
        const result = pedidos.map(p => ({
            ...p,
            items: JSON.parse(p.items || '[]'),
            cliente: JSON.parse(p.cliente || '{}'),
            esMayorista: !!p.esMayorista
        }));
        res.json({ lista: result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tienda/confirmar-pedido', (req, res) => {
    try {
        const { pedidoId } = req.body;
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND estado = ?').get(pedidoId, 'pendiente');
        if (!pedido) return res.status(400).json({ error: 'Pedido no válido' });
        
        const pin = generarPIN();
        const ventaId = 'FAC-' + Date.now();
        
        db.prepare(`INSERT INTO ventas (id, fecha, fechaTimestamp, items, total, metodoPago, logistica, cliente, esMayorista, estado, origen, pedidoId)
            VALUES (?, datetime('now','localtime'), ?, ?, ?, 'pedido_online', ?, ?, ?, 'completada', 'tienda', ?)`)
          .run(ventaId, Date.now(), pedido.items, pedido.total, pedido.tipoEntrega === 'envio' ? 'envio' : 'local', pedido.cliente, pedido.esMayorista, pedido.id);
        
        db.prepare('UPDATE pedidos SET estado = ?, pin = ?, ventaId = ? WHERE id = ?')
          .run('confirmado', pin, ventaId, pedido.id);
        
        const cliente = JSON.parse(pedido.cliente || '{}');
        if (cliente.email) {
            enviarEmail(cliente.email, `Pedido #${pedido.id} confirmado`, `
                <h1>Casa Elegida</h1>
                <h2>¡Pedido confirmado!</h2>
                ${pedido.tipoEntrega === 'local' ? `<p>Tu PIN de retiro: <strong>${pin}</strong></p>` : '<p>Pronto despacharemos tu pedido.</p>'}
            `);
        }
        
        res.json({ success: true, ventaId, pin });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tienda/cancelar-pedido', authMiddleware, (req, res) => {
    try {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND usuarioId = ? AND estado = ?')
          .get(req.body.pedidoId, req.usuario.id, 'pendiente');
        if (!pedido) return res.status(400).json({ error: 'No se puede cancelar' });
        
        const items = JSON.parse(pedido.items || '[]');
        for (let item of items) {
            if (item.esManual) continue;
            db.prepare('UPDATE variantes SET stock = stock + ? WHERE productoId = ? AND nombre = ?')
              .run(item.cant, item.pId, item.vNom);
        }
        
        db.prepare('UPDATE pedidos SET estado = ?, fechaCancelado = datetime(\'now\') WHERE id = ?')
          .run('cancelado', pedido.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Gestión de pedidos (admin)
app.post('/tienda/marcar-abonado', (req, res) => {
    try {
        db.prepare('UPDATE pedidos SET estado = ?, fechaAbonado = datetime(\'now\') WHERE id = ?').run('abonado', req.body.pedidoId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tienda/marcar-enviado', (req, res) => {
    try {
        db.prepare('UPDATE pedidos SET estado = ?, fechaEnviado = datetime(\'now\') WHERE id = ?').run('enviado', req.body.pedidoId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tienda/marcar-entregado', (req, res) => {
    try {
        db.prepare('UPDATE pedidos SET estado = ?, fechaEntregado = datetime(\'now\') WHERE id = ?').run('entregado', req.body.pedidoId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tienda/cancelar-pedido-admin', (req, res) => {
    try {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.body.pedidoId);
        if (!pedido) return res.status(400).json({ error: 'Pedido no encontrado' });
        
        const items = JSON.parse(pedido.items || '[]');
        for (let item of items) {
            if (item.esManual) continue;
            db.prepare('UPDATE variantes SET stock = stock + ? WHERE productoId = ? AND nombre = ?')
              .run(item.cant, item.pId, item.vNom);
        }
        
        db.prepare('UPDATE pedidos SET estado = ?, fechaCancelado = datetime(\'now\') WHERE id = ?')
          .run('cancelado', pedido.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Retirar con PIN
app.post('/tienda/retirar-pedido', (req, res) => {
    try {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND pin = ?').get(req.body.pedidoId, req.body.pin);
        if (!pedido) return res.status(400).json({ error: 'PIN incorrecto o pedido no válido' });
        db.prepare('UPDATE pedidos SET estado = ?, fechaEntregado = datetime(\'now\') WHERE id = ?').run('entregado', pedido.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tienda/verificar-pin', (req, res) => {
    try {
        const pedido = db.prepare("SELECT * FROM pedidos WHERE pin = ? AND estado IN ('confirmado','abonado')").get(req.body.pin);
        if (!pedido) return res.status(400).json({ error: 'PIN no encontrado' });
        const cliente = JSON.parse(pedido.cliente || '{}');
        const items = JSON.parse(pedido.items || '[]');
        res.json({ success: true, pedido: { ...pedido, cliente, items } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== DASHBOARD ====================
app.post('/dashboard/stats', (req, res) => {
    try {
        const ventasHoy = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total FROM ventas WHERE date(fecha) = date('now','localtime')").get();
        const clientesNuevos = db.prepare("SELECT COUNT(*) as count FROM usuarios WHERE date(fechaRegistro) >= date('now','start of month')").get();
        res.json({
            ventasHoy: ventasHoy.count,
            totalHoy: ventasHoy.total,
            ticketPromedio: ventasHoy.count > 0 ? Math.round(ventasHoy.total / ventasHoy.count) : 0,
            clientesNuevos: clientesNuevos.count,
            ventasSemana: [],
            productosTop: [],
            clientesTop: [],
            horariosPico: []
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== NOTIFICACIONES ====================
app.post('/notificaciones', (req, res) => {
    try {
        const notifs = db.prepare('SELECT * FROM notificaciones ORDER BY fecha DESC LIMIT 50').all();
        res.json({ lista: notifs });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/notificaciones/leer', (req, res) => {
    try {
        db.prepare('UPDATE notificaciones SET leida = 1 WHERE id = ?').run(req.body.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/notificaciones/leer-todas', (req, res) => {
    try {
        db.prepare('UPDATE notificaciones SET leida = 1').run();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== MIS PEDIDOS (CLIENTE) ====================
app.get('/api/mis-pedidos', authMiddleware, (req, res) => {
    try {
        const pedidos = db.prepare('SELECT * FROM pedidos WHERE usuarioId = ? ORDER BY fechaTimestamp DESC').all(req.usuario.id);
        const result = pedidos.map(p => ({
            ...p,
            items: JSON.parse(p.items || '[]'),
            cliente: JSON.parse(p.cliente || '{}')
        }));
        res.json({ lista: result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Manejo de errores
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Error interno' }); });

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║     🏪 CASA ELEGIDA - SISTEMA ACTIVO (SQLite)    ║`);
    console.log(`╠══════════════════════════════════════════════════╣`);
    console.log(`║  Tienda: http://localhost:${PORT}/tienda            ║`);
    console.log(`║  Admin:  http://localhost:${PORT}/admin             ║`);
    console.log(`╚══════════════════════════════════════════════════╝\n`);
});

process.on('SIGTERM', () => { db.close(); process.exit(0); });
process.on('SIGINT', () => { db.close(); process.exit(0); });

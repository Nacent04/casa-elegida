try { require('dotenv').config(); } catch(e) {}
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
const { Pool } = require('pg');
const archiver = require('archiver');
const unzipper = require('unzipper');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

const BACKUP_DIR = path.join(__dirname, 'backups');
['./backups', './backups/temp'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const backupStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './backups/temp/'),
    filename: (req, file, cb) => cb(null, 'restore_' + Date.now() + path.extname(file.originalname))
});
const uploadBackup = multer({ storage: backupStorage, limits: { fileSize: 500 * 1024 * 1024 } });

async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS productos (
                id BIGINT PRIMARY KEY,
                nombre TEXT NOT NULL,
                precio REAL NOT NULL DEFAULT 0,
                "precioMayor" REAL DEFAULT 0,
                descripcion TEXT DEFAULT '',
                "categoriaId" INTEGER,
                subcategoria TEXT DEFAULT '',
                "fechaCreacion" TEXT DEFAULT NOW(),
                destacado INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS variantes (
                id SERIAL PRIMARY KEY,
                "productoId" BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
                nombre TEXT NOT NULL,
                stock INTEGER DEFAULT 0,
                foto TEXT DEFAULT '',
                foto_mobile TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS categorias (
                id BIGINT PRIMARY KEY,
                nombre TEXT NOT NULL,
                subcategorias TEXT DEFAULT '[]'
            );
            CREATE TABLE IF NOT EXISTS usuarios (
                id TEXT PRIMARY KEY,
                nombre TEXT NOT NULL DEFAULT '',
                apellido TEXT NOT NULL DEFAULT '',
                email TEXT UNIQUE NOT NULL,
                telefono TEXT DEFAULT '',
                dni TEXT DEFAULT '',
                password TEXT,
                "googleId" TEXT,
                foto TEXT DEFAULT '',
                rol TEXT DEFAULT 'cliente',
                "resetPin" TEXT,
                "resetPinExpires" BIGINT,
                "fechaRegistro" TEXT DEFAULT NOW(),
                direccion TEXT DEFAULT '',
                provincia TEXT DEFAULT '',
                localidad TEXT DEFAULT '',
                cp TEXT DEFAULT '',
                "datosCompletos" INTEGER DEFAULT 0,
                "carritoGuardado" TEXT DEFAULT '[]'
            );
            CREATE TABLE IF NOT EXISTS ventas (
                id TEXT PRIMARY KEY,
                fecha TEXT,
                "fechaTimestamp" BIGINT,
                items TEXT DEFAULT '[]',
                total REAL DEFAULT 0,
                "metodoPago" TEXT DEFAULT 'efectivo',
                logistica TEXT DEFAULT 'local',
                cliente TEXT DEFAULT '{}',
                "esMayorista" INTEGER DEFAULT 0,
                "razonMayorista" TEXT DEFAULT '',
                estado TEXT DEFAULT 'completada',
                origen TEXT DEFAULT 'admin',
                "pedidoId" TEXT
            );
            CREATE TABLE IF NOT EXISTS pedidos (
                id TEXT PRIMARY KEY,
                fecha TEXT,
                "fechaTimestamp" BIGINT,
                items TEXT DEFAULT '[]',
                total REAL DEFAULT 0,
                cliente TEXT DEFAULT '{}',
                "tipoEntrega" TEXT DEFAULT 'local',
                "metodoEnvio" TEXT DEFAULT '',
                "esMayorista" INTEGER DEFAULT 0,
                "razonMayorista" TEXT DEFAULT '',
                estado TEXT DEFAULT 'pendiente',
                origen TEXT DEFAULT 'tienda',
                pin TEXT,
                "ventaId" TEXT,
                "usuarioId" TEXT,
                "stockDescontado" INTEGER DEFAULT 1,
                "fechaCancelado" TEXT,
                "fechaAbonado" TEXT,
                "fechaEnviado" TEXT,
                "fechaEntregado" TEXT
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
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS logs_admin (
                id TEXT PRIMARY KEY,
                admin TEXT,
                accion TEXT,
                detalles TEXT,
                ip TEXT,
                fecha TEXT DEFAULT NOW(),
                "fechaLocal" TEXT
            );
            CREATE TABLE IF NOT EXISTS perfiles (
                id TEXT PRIMARY KEY,
                usuario TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                nombre TEXT NOT NULL,
                rol TEXT DEFAULT 'vendedor',
                permisos TEXT DEFAULT '[]',
                activo INTEGER DEFAULT 1,
                "fechaCreation" TEXT DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS caja_diaria (
                fecha TEXT PRIMARY KEY,
                "montoInicial" REAL DEFAULT 0,
                "abiertaPor" TEXT,
                "cerradaPor" TEXT,
                estado TEXT DEFAULT 'cerrada',
                "aperturaTimestamp" BIGINT,
                "cierreTimestamp" BIGINT,
                "totalVentas" REAL DEFAULT 0,
                "totalEsperado" REAL DEFAULT 0,
                "detallePagos" TEXT DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS caja_profesional (
                fecha TEXT PRIMARY KEY,
                "aperturaTimestamp" BIGINT,
                "abiertaPor" TEXT,
                "cerradaPor" TEXT,
                "montoInicialEfectivo" REAL DEFAULT 0,
                "montoInicialTransferencia" REAL DEFAULT 0,
                "ventasEfectivo" REAL DEFAULT 0,
                "ventasTransferencia" REAL DEFAULT 0,
                "ventasWebTransferencia" REAL DEFAULT 0,
                "efectivoEntregado" REAL DEFAULT 0,
                "transferenciaEntregada" REAL DEFAULT 0,
                "totalEsperadoEfectivo" REAL DEFAULT 0,
                "totalEsperadoTransferencia" REAL DEFAULT 0,
                "diferenciaEfectivo" REAL DEFAULT 0,
                "diferenciaTransferencia" REAL DEFAULT 0,
                "cantidadVentas" INTEGER DEFAULT 0,
                "estado" TEXT DEFAULT 'cerrada',
                "cierreTimestamp" BIGINT
            );
            CREATE TABLE IF NOT EXISTS costos_producto (
                id SERIAL PRIMARY KEY,
                "productoId" BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
                costo REAL DEFAULT 0,
                flete REAL DEFAULT 0,
                adicionales TEXT DEFAULT '[]',
                "fechaActualizacion" BIGINT
            );
        `);
        console.log('✅ PostgreSQL listo');
    } finally {
        client.release();
    }
}

(async () => {
    try {
        await pool.query("ALTER TABLE variantes ADD COLUMN IF NOT EXISTS foto_mobile TEXT DEFAULT ''");
        await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS "carritoGuardado" TEXT DEFAULT \'[]\'');
        console.log('✅ Columnas de base de datos verificadas con éxito');
    } catch(e) {
        console.log('⚠️ Aviso base de datos:', e.message);
    }
})();

const configInicial = {
    logo: '', empresa: JSON.stringify({ nombre: "ESENCIA CURVY", telefono: "", email: "esenciacurvy26@gmail.com", direccion: "" }),
    horarios: JSON.stringify({ lunesViernes: "9:00 - 13:00 y 17:00 - 20:00", sabados: "9:00 - 13:00", domingos: "Cerrado" }),
    redes: JSON.stringify({ instagram: "", facebook: "", tiktok: "" }),
    pagos: JSON.stringify({ alias: "", cbu: "", banco: "", titular: "" }),
    mayorista: JSON.stringify({ habilitado: false, modo: "cantidad", valorCantidad: 3, valorMonto: 80000 }),
    tienda: JSON.stringify({ habilitada: true, titulo: "ESENCIA CURVY", mensajeBienvenida: "Calidad y confort", retiroLocal: true }),
    diseno: JSON.stringify({ colorPrimario: "#4A3728", colorSecundario: "#D4A373", colorFondo: "#FEFAE0", colorTexto: "#4A3728" }),
    registroObligatorio: 'true',
    heroConfig: JSON.stringify({ titulo: "ESENCIA CURVY", subtitulo: "Moda curvy premium", badge: "✦ Colección Exclusiva" }),
    seccionesDestacadas: JSON.stringify([{ id: "dest-1", titulo: "Novedades", tipo: "categoria", valor: "Vestidos", limite: 4 }]),
    plantilla: 'moderna',
    icono: 'store'
};

async function initConfig() {
    for (const [k, v] of Object.entries(configInicial)) {
        await pool.query('INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO NOTHING', [k, v]);
    }
}

async function initMetodosEnvio() {
    // Función vacía para evitar que se sigan inyectando métodos predeterminados duplicados.
    // Ahora el sistema leerá únicamente lo que cargues de forma manual desde el panel de administración.
}

async function initAdmin() {
    const existe = await pool.query("SELECT id FROM perfiles WHERE usuario = 'admin'");
    if (existe.rows.length === 0) {
        const hp = bcrypt.hashSync('NacentLion03-04-04', 10);
        await pool.query('INSERT INTO perfiles (id, usuario, password, nombre, rol, permisos) VALUES ($1, $2, $3, $4, $5, $6)',
            ['PERF-' + Date.now(), 'admin', hp, 'Administrador Principal', 'admin', '[]']);
        console.log('✅ Admin creado');
    }
}

async function getConfig() {
    const result = await pool.query('SELECT clave, valor FROM configuracion');
    const config = {};
    result.rows.forEach(r => {
        try { config[r.clave] = JSON.parse(r.valor); } catch(e) { config[r.clave] = r.valor; }
    });
    return config;
}

async function setConfig(k, v) {
    const val = typeof v === 'string' ? v : JSON.stringify(v);
    await pool.query('INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = $2', [k, val]);
}

async function getEmpresa() {
    const c = await getConfig();
    return typeof c.empresa === 'string' ? JSON.parse(c.empresa) : (c.empresa || { nombre: 'ESENCIA CURVY' });
}

async function logActividad(admin, accion, detalles, req) {
    try {
        const id = 'LOG-' + Date.now();
        const ip = req?.ip || 'localhost';
        const fecha = new Date().toISOString();
        const fechaLocal = new Date().toLocaleString('es-AR');
        await pool.query('INSERT INTO logs_admin (id, admin, accion, detalles, ip, fecha, "fechaLocal") VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [id, admin || 'Sistema', accion, String(detalles).substring(0, 200), ip, fecha, fechaLocal]);
    } catch(e) {}
}

async function crearNotificacion(tipo, titulo, desc) {
    await pool.query("INSERT INTO notificaciones (id, tipo, titulo, descripcion, fecha, leida) VALUES ($1,$2,$3,$4,NOW(),0)",
        ['NOTIF-' + Date.now(), tipo, titulo, desc]);
}

async function enviarEmail(dest, asunto, html) {
    // Si faltan las variables en Railway, frena el código acá
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error("❌ Error: Faltan configurar las variables EMAIL_USER o EMAIL_PASS en Railway.");
        return false;
    }
    try {
        await transporter.sendMail({ 
            from: `"${(await getEmpresa()).nombre}" <${process.env.EMAIL_USER}>`, 
            to: dest, 
            subject: asunto, 
            html 
        });
        console.log(`📩 Correo enviado con éxito a: ${dest}`);
        return true;
    } catch(e) { 
        console.error("❌ Error real de Nodemailer al conectar con Gmail:", e.message);
        return false; 
    }
}

cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
// CONFIGURACIÓN SEGURO DEL TRANSPORTADOR DE EMAIL
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true para puerto 465 con SSL nativo
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false // Evita que caídas de certificados locales frenen el proceso
    }
});
const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || 'casa-elegida-session-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://esencia-curvy-production.up.railway.app/auth/google/callback';
const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });

['./uploads', './public', './backups', './backups/temp'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
const storage = multer.diskStorage({ destination: (req, f, cb) => cb(null, './uploads/'), filename: (req, f, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(f.originalname)) });
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, f, cb) => { const a = /jpeg|jpg|png|gif|webp/; cb(null, a.test(path.extname(f.originalname).toLowerCase()) && a.test(f.mimetype)); } });

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({ 
    secret: SESSION_SECRET, 
    resave: false, 
    saveUninitialized: false, 
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        secure: false,
        sameSite: 'lax'
    } 
}));
app.use(passport.initialize()); 
app.use(passport.session());
app.use('/uploads', express.static('uploads')); 
app.use(express.static('public'));

passport.use(new GoogleStrategy({ 
    clientID: GOOGLE_CLIENT_ID, 
    clientSecret: GOOGLE_CLIENT_SECRET, 
    callbackURL: CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('No se recibió un email válido de Google'), null);

        let userResult = await pool.query('SELECT * FROM usuarios WHERE email = $1 OR "googleId" = $2', [email, profile.id]);
        
        if (userResult.rows.length > 0) {
            return done(null, userResult.rows[0]);
        }

        const usuarioTemporal = {
            id: 'tmp_' + Math.random().toString(36).substr(2, 9),
            nombre: profile.name?.givenName || '',
            apellido: profile.name?.familyName || '',
            email: email,
            googleId: profile.id,
            foto: profile.photos?.[0]?.value || '',
            esNuevoGoogle: true
        };

        return done(null, usuarioTemporal);
    } catch (error) {
        return done(error, null);
    }
}));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login?error=google' }),
    async (req, res) => {
        try {
            if (!req.user) return res.redirect('/login?error=nouser');
            
            if (!req.user.esNuevoGoogle) {
                const token = jwt.sign({ id: req.user.id, email: req.user.email, nombre: req.user.nombre, rol: req.user.rol }, JWT_SECRET, { expiresIn: '7d' });
                return res.send(`
                    <!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
                    <script>
                        localStorage.setItem('token', '${token}');
                        localStorage.setItem('usuario', JSON.stringify({id:'${req.user.id}',nombre:'${req.user.nombre}',email:'${req.user.email}'}));
                        window.location.href = '/tienda';
                    </script></body></html>`);
            }

            const params = new URLSearchParams({
                google: 'true',
                nombre: req.user.nombre,
                apellido: req.user.apellido,
                email: req.user.email,
                googleId: req.user.googleId,
                foto: req.user.foto
            }).toString();

            res.redirect(`/completar-datos?${params}`);
        } catch(e) { 
            console.error('❌ Error en callback Google:', e); 
            res.redirect('/login?error=server'); 
        }
    }
);

passport.serializeUser((user, done) => { 
    done(null, user); 
});

passport.deserializeUser((user, done) => {
    done(null, user); 
});

const authMiddleware = (req, res, next) => { 
    const t = req.headers.authorization?.replace('Bearer ', ''); 
    if (!t) return res.status(401).json({ error: 'No autorizado' }); 
    try { req.usuario = jwt.verify(t, JWT_SECRET); next(); } 
    catch(e) { res.status(401).json({ error: 'Token inválido' }); } 
};

const adminMiddleware = (permiso = null) => (req, res, next) => { 
    const t = req.headers.authorization?.replace('Bearer ', ''); 
    if (!t) return res.status(401).json({ error: 'No autorizado' }); 
    try { 
        const d = jwt.verify(t, JWT_SECRET); 
        if (d.tipo !== 'admin') return res.status(401).json({ error: 'No autorizado' }); 
        if (d.rol === 'admin') { req.admin = d; return next(); } 
        if (permiso && !d.permisos.includes(permiso)) return res.status(403).json({ error: 'Sin permiso' }); 
        req.admin = d; next(); 
    } catch(e) { res.status(401).json({ error: 'Token inválido' }); } 
};

const generarPIN = () => Math.floor(1000 + Math.random() * 9000).toString();

['admin','tienda','checkout','login','registro','perfil','recuperar','mis-pedidos','completar-datos'].forEach(p => 
    app.get('/' + p, (req, res) => res.sendFile(path.join(__dirname, 'public', p + '.html')))
);

app.get('/', (req, res) => res.redirect('/tienda'));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.post('/admin/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;
        const p = (await pool.query('SELECT * FROM perfiles WHERE usuario = $1 AND activo = 1', [usuario])).rows[0];
        if (!p) return res.status(401).json({ error: 'Usuario no encontrado' });
        if (!(await bcrypt.compare(password, p.password))) return res.status(401).json({ error: 'Contraseña incorrecta' });
        await logActividad(p.nombre, 'LOGIN_ADMIN', 'Inicio de sesión', req);
        res.json({ success: true, token: jwt.sign({ id: p.id, usuario: p.usuario, nombre: p.nombre, rol: p.rol, permisos: JSON.parse(p.permisos||'[]'), tipo: 'admin' }, JWT_SECRET, { expiresIn: '8h' }), perfil: { id: p.id, usuario: p.usuario, nombre: p.nombre, rol: p.rol, permisos: JSON.parse(p.permisos||'[]') } });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/cambiar-password', adminMiddleware(), async (req, res) => {
    try {
        const { passwordActual, passwordNueva } = req.body;
        if (!passwordActual || !passwordNueva || passwordNueva.length < 6) return res.status(400).json({ error: 'Datos inválidos' });
        const p = (await pool.query('SELECT * FROM perfiles WHERE id = $1', [req.admin.id])).rows[0];
        if (!p) return res.status(404).json({ error: 'Perfil no encontrado' });
        if (!(await bcrypt.compare(passwordActual, p.password))) return res.status(401).json({ error: 'Contraseña incorrecta' });
        await pool.query('UPDATE perfiles SET password = $1 WHERE id = $2', [await bcrypt.hash(passwordNueva, 10), req.admin.id]);
        await logActividad(req.admin.nombre, 'CAMBIO_PASSWORD', 'Cambió su contraseña', req);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/perfiles', adminMiddleware(), async (req, res) => {
    const perfiles = (await pool.query('SELECT id, usuario, nombre, rol, permisos, activo FROM perfiles ORDER BY "fechaCreacion" DESC')).rows;
    res.json({ lista: perfiles.map(p => ({ ...p, permisos: JSON.parse(p.permisos||'[]') })) });
});

app.post('/admin/crear-perfil', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No autorizado' });
        let decoded;
        try { decoded = jwt.verify(token, JWT_SECRET); } catch(e) { return res.status(401).json({ error: 'Token inválido' }); }
        if (decoded.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
        const { adminPassword, usuario, password, nombre, permisos } = req.body;
        if (!adminPassword || !usuario || !password || !nombre) return res.status(400).json({ error: 'Todos los campos requeridos' });
        const adminPerfil = (await pool.query("SELECT * FROM perfiles WHERE usuario = 'admin'")).rows[0];
        if (!adminPerfil) return res.status(404).json({ error: 'Admin no encontrado' });
        if (!(await bcrypt.compare(adminPassword, adminPerfil.password))) return res.status(401).json({ error: 'Contraseña incorrecta' });
        if ((await pool.query('SELECT id FROM perfiles WHERE usuario = $1', [usuario])).rows.length > 0) return res.status(400).json({ error: 'Usuario ya existe' });
        await pool.query('INSERT INTO perfiles (id, usuario, password, nombre, rol, permisos) VALUES ($1,$2,$3,$4,$5,$6)',
            ['PERF-' + Date.now(), usuario, await bcrypt.hash(password, 10), nombre, 'vendedor', JSON.stringify(permisos||[])]);
        await logActividad(decoded.nombre, 'CREAR_PERFIL', `Creó perfil: ${nombre} (${usuario})`, req);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/editar-perfil', adminMiddleware(), async (req, res) => {
    try {
        const { id, nombre, permisos, activo } = req.body;
        const p = (await pool.query('SELECT * FROM perfiles WHERE id = $1', [id])).rows[0];
        if (!p || p.rol === 'admin') return res.status(400).json({ error: 'No se puede editar' });
        await pool.query('UPDATE perfiles SET nombre=$1, permisos=$2, activo=$3 WHERE id=$4',
            [nombre||p.nombre, JSON.stringify(permisos||[]), activo!==undefined?activo:p.activo, id]);
        await logActividad(req.admin.nombre, 'EDITAR_PERFIL', `Editó perfil: ${id}`, req);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/registro', async (req, res) => {
    try {
        const { nombre, apellido, email, dni, telefono, password } = req.body;
        if (!nombre || !apellido || !email || !dni || !password) return res.status(400).json({ error: 'Completá todos los campos' });
        if ((await pool.query('SELECT id FROM usuarios WHERE email=$1', [email])).rows.length > 0) return res.status(400).json({ error: 'Email ya registrado' });
        const id = 'USR-' + Date.now();
        await pool.query('INSERT INTO usuarios (id,nombre,apellido,email,dni,telefono,password,rol,"datosCompletos") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)',
            [id, nombre, apellido, email, dni, telefono||'', await bcrypt.hash(password, 10), 'cliente']);
        await logActividad('Sistema', 'REGISTRO_CLIENTE', `Nuevo cliente: ${email}`, req);
        res.json({ success: true, token: jwt.sign({ id, email, nombre, rol: 'cliente' }, JWT_SECRET, { expiresIn: '7d' }), usuario: { id, nombre, apellido, email } });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/crear-cuenta-google', async (req, res) => {
    try {
        const { nombre, apellido, email, googleId, foto, dni, telefono, direccion, provincia, localidad, cp } = req.body;
        
        if (!nombre || !apellido || !email || !googleId || !dni || !telefono || !direccion || !provincia || !localidad || !cp) {
            return res.status(400).json({ error: 'Todos los campos del formulario son obligatorios para crear tu cuenta' });
        }

        const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (existe.rows.length > 0) return res.status(400).json({ error: 'Este correo ya se encuentra registrado' });

        const nuevoId = 'USR-' + Date.now();

        await pool.query(
            'INSERT INTO usuarios (id, nombre, apellido, email, dni, telefono, direccion, provincia, localidad, cp, "googleId", foto, rol, "datosCompletos") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,\'cliente\',1)',
            [nuevoId, nombre, apellido, email, dni, telefono, direccion, provincia, localidad, cp, googleId, foto]
        );

        const token = jwt.sign({ id: nuevoId, email: email, nombre: nombre, rol: 'cliente' }, JWT_SECRET, { expiresIn: '7d' });
        await logActividad('Sistema', 'REGISTRO_GOOGLE_COMPLETO', `Cuenta creada con éxito: ${email}`, req);

        res.json({ 
            success: true, 
            token, 
            usuario: { id: nuevoId, nombre: nombre, apellido: apellido, email: email } 
        });
    } catch(e) {
        console.error('❌ Error al crear cuenta final de Google:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const u = (await pool.query('SELECT * FROM usuarios WHERE email=$1', [email])).rows[0];
        if (!u?.password || !(await bcrypt.compare(password, u.password))) return res.status(401).json({ error: 'Credenciales inválidas' });
        await logActividad('Sistema', 'LOGIN_CLIENTE', `Cliente: ${email}`, req);
        const token = jwt.sign({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol }, JWT_SECRET, { expiresIn: '7d' });
        if (u.datosCompletos == 0) return res.json({ success: true, token, completarDatos: true, usuario: { id: u.id, nombre: u.nombre, apellido: u.apellido, email: u.email } });
        res.json({ success: true, token, usuario: { id: u.id, nombre: u.nombre, apellido: u.apellido, email: u.email } });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/recuperar', async (req, res) => {
    try {
        const u = (await pool.query('SELECT * FROM usuarios WHERE email=$1', [req.body.email])).rows[0];
        if (!u) return res.status(404).json({ error: 'Email no encontrado' });
        const pin = Math.floor(100000 + Math.random()*900000).toString();
        await pool.query('UPDATE usuarios SET "resetPin"=$1, "resetPinExpires"=$2 WHERE id=$3', [pin, Date.now()+3600000, u.id]);
        await enviarEmail(u.email, 'Recuperación', `<h1>ESENCIA CURVY</h1><p>PIN: <strong>${pin}</strong></p>`);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/reset-password', async (req, res) => {
    try {
        const { email, pin, newPassword } = req.body;
        const u = (await pool.query('SELECT * FROM usuarios WHERE email=$1', [email])).rows[0];
        if (!u || u["resetPin"] !== pin || u["resetPinExpires"] < Date.now()) return res.status(400).json({ error: 'PIN inválido' });
        await pool.query('UPDATE usuarios SET password=$1, "resetPin"=NULL, "resetPinExpires"=NULL WHERE id=$2', [await bcrypt.hash(newPassword, 10), u.id]);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/auth/me', authMiddleware, async (req, res) => {
    const u = (await pool.query('SELECT id,nombre,apellido,email,telefono,dni,direccion,provincia,localidad,cp,"datosCompletos" FROM usuarios WHERE id=$1', [req.usuario.id])).rows[0];
    res.json(u || {});
});

app.post('/auth/update-profile', authMiddleware, async (req, res) => {
    const { telefono, direccion, provincia, localidad, cp } = req.body;
    await pool.query('UPDATE usuarios SET telefono=$1, direccion=$2, provincia=$3, localidad=$4, cp=$5 WHERE id=$6',
        [telefono||'', direccion||'', provincia||'', localidad||'', cp||'', req.usuario.id]);
    res.json({ success: true });
});

app.post('/auth/completar-datos', authMiddleware, async (req, res) => {
    try {
        const { nombre, apellido, dni, telefono, direccion, provincia, localidad, cp } = req.body;
        if (!nombre || !apellido || !dni || !telefono || !direccion || !provincia || !localidad || !cp) return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        await pool.query('UPDATE usuarios SET nombre=$1, apellido=$2, dni=$3, telefono=$4, direccion=$5, provincia=$6, localidad=$7, cp=$8, "datosCompletos"=1 WHERE id=$9',
            [nombre, apellido, dni, telefono, direccion, provincia, localidad, cp, req.usuario.id]);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==========================================================================
// ENDPOINTS PARA MANEJAR EL CARRITO PERSISTENTE DESDE LA BASE DE DATOS
// ==========================================================================

app.post('/api/guardar-carrito', authMiddleware, async (req, res) => {
    try {
        const { carrito } = req.body;
        const carritoString = typeof carrito === 'string' ? carrito : JSON.stringify(carrito || []);
        await pool.query('UPDATE usuarios SET "carritoGuardado" = $1 WHERE id = $2', [carritoString, req.usuario.id]);
        return res.json({ success: true, message: 'Carrito sincronizado en el servidor.' });
    } catch (e) {
        console.error('❌ Error al guardar carrito en servidor:', e.message);
        return res.status(500).json({ error: 'Error al sincronizar carrito: ' + e.message });
    }
});

app.get('/api/obtener-carrito', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT "carritoGuardado" FROM usuarios WHERE id = $1', [req.usuario.id]);
        const carritoTexto = result.rows[0]?.carritoGuardado || '[]';
        return res.json({ success: true, carrito: JSON.parse(carritoTexto) });
    } catch (e) {
        console.error('❌ Error al obtener carrito desde servidor:', e.message);
        return res.status(500).json({ error: 'Error al recuperar carrito: ' + e.message });
    }
});

app.post('/listar', async (req, res) => {
    const prods = (await pool.query('SELECT * FROM productos ORDER BY id DESC')).rows;
    for (const p of prods) {
        p.variantes = (await pool.query('SELECT * FROM variantes WHERE "productoId"=$1', [p.id])).rows;
    }
    res.json({ lista: prods });
});

app.post('/guardar-producto', async (req, res) => {
    try {
        const p = req.body;
        if (!p.nombre?.trim() || p.precio <= 0) return res.status(400).json({ error: 'Datos inválidos' });
        const existe = (await pool.query('SELECT id FROM productos WHERE id=$1', [p.id])).rows[0];
        if (existe) {
            await pool.query('UPDATE productos SET nombre=$1,precio=$2,"precioMayor"=$3,descripcion=$4,"categoriaId"=$5,subcategoria=$6,destacado=$7 WHERE id=$8',
                [p.nombre, p.precio, p.precioMayor||0, p.descripcion||'', p.categoriaId ? parseInt(p.categoriaId) : null, p.subcategoria||'', p.destacado||0, p.id]);
            await pool.query('DELETE FROM variantes WHERE "productoId"=$1', [p.id]);
        } else {
            await pool.query('INSERT INTO productos (id,nombre,precio,"precioMayor",descripcion,"categoriaId",subcategoria,destacado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
                [p.id, p.nombre, p.precio, p.precioMayor||0, p.descripcion||'', p.categoriaId ? parseInt(p.categoriaId) : null, p.subcategoria||'', p.destacado||0]);
        }
        if (p.variantes?.length) {
            for (const v of p.variantes) {
                await pool.query('INSERT INTO variantes ("productoId", nombre, stock, foto, foto_mobile) VALUES ($1,$2,$3,$4,$5)', [p.id, v.nombre, v.stock||0, v.foto||'', v.foto_mobile||'']);
            }
        }
        await logActividad('Admin', 'GUARDAR_PRODUCTO', `Producto: ${p.nombre}`, req);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/eliminar-producto', async (req, res) => {
    await pool.query('DELETE FROM productos WHERE id=$1', [req.body.id]);
    await logActividad('Admin', 'ELIMINAR_PRODUCTO', `ID: ${req.body.id}`, req);
    res.json({ success: true });
});

app.post('/reordenar-productos', (req, res) => res.json({ success: true }));
app.post('/verificar-stock', async (req, res) => {
    const v = (await pool.query('SELECT stock FROM variantes WHERE "productoId"=$1 AND nombre=$2', [req.body.productoId, req.body.varianteNombre])).rows[0];
    if (!v) return res.status(404).json({ error: 'No encontrada' });
    res.json({ stock: v.stock });
});
app.post('/stock-bajo', async (req, res) => {
    const vars = (await pool.query('SELECT v.*, p.nombre as "productoNombre" FROM variantes v JOIN productos p ON v."productoId"=p.id WHERE v.stock <= $1', [req.body.minimo||5])).rows;
    res.json({ stockBajo: vars });
});
app.post('/subir-imagen', upload.single('foto'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No imagen' });
    const r = await cloudinary.uploader.upload(req.file.path, { folder: 'esencia-curvy' });
    fs.unlinkSync(req.file.path);
    res.json({ url: r.secure_url });
});
app.post('/subir-logo', adminMiddleware('config'), upload.single('logo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No imagen' });
    const r = await cloudinary.uploader.upload(req.file.path, { folder: 'esencia-curvy' });
    fs.unlinkSync(req.file.path);
    await setConfig('logo', r.secure_url);
    await logActividad('Admin', 'SUBIR_LOGO', 'Logo actualizado', req);
    res.json({ success: true });
});
app.post('/eliminar-logo', adminMiddleware('config'), async (req, res) => { await setConfig('logo', ''); res.json({ success: true }); });

app.post('/listar-categories', async (req, res) => {
    const cats = (await pool.query('SELECT * FROM categorias')).rows;
    res.json({ lista: cats.map(c => ({ ...c, subcategorias: JSON.parse(c.subcategorias||'[]') })) });
});

app.post('/guardar-categoria', async (req, res) => {
    const { id, nombre, subcategorias } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    const existe = (await pool.query('SELECT id FROM categorias WHERE id=$1', [id])).rows[0];
    if (existe) {
        await pool.query('UPDATE categorias SET nombre=$1,subcategorias=$2 WHERE id=$3', [nombre.trim(), JSON.stringify(subcategorias||[]), id]);
    } else {
        const nuevoId = id || Math.floor(Date.now() / 1000);
        await pool.query('INSERT INTO categorias (id,nombre,subcategorias) VALUES ($1,$2,$3)', [nuevoId, nombre.trim(), JSON.stringify(subcategorias||[])]);
    }
    await logActividad('Admin', 'GUARDAR_CATEGORIA', `Categoría: ${nombre}`, req);
    res.json({ success: true });
});

app.post('/eliminar-categoria', async (req, res) => { await pool.query('DELETE FROM categorias WHERE id=$1', [req.body.id]); res.json({ success: true }); });
app.post('/listar-metodos-envio', async (req, res) => {
    const metodos = (await pool.query('SELECT nombre FROM metodos_envio')).rows;
    res.json({ lista: metodos.map(m => m.nombre) });
});
app.post('/guardar-metodos-envio', async (req, res) => {
    await pool.query('DELETE FROM metodos_envio');
    for (const m of (req.body.lista||[])) await pool.query('INSERT INTO metodos_envio (nombre) VALUES ($1)', [m]);
    res.json({ success: true });
});

app.post('/get-config', adminMiddleware('config'), async (req, res) => res.json(await getConfig()));
app.post('/save-config', adminMiddleware('config'), async (req, res) => {
    ['empresa','horarios','redes','pagos'].forEach(async k => { if(req.body[k]) await setConfig(k, req.body[k]); });
    await logActividad('Admin', 'GUARDAR_CONFIG', 'Configuración actualizada', req);
    res.json({ success: true });
});
app.post('/save-tienda-config', adminMiddleware('config'), async (req, res) => { if(req.body.tienda) await setConfig('tienda', req.body.tienda); res.json({ success: true }); });
app.post(['/admin/guardar-mayorista', '/save-mayorista-config'], adminMiddleware('config'), async (req, res) => {
    try {
        let datos = req.body;
        let habilitado = datos.hasOwnProperty('habilitado') ? datos.habilitado : false;
        let modo = datos.modo || 'cantidad';
        let valorCantidad = parseInt(datos.valorCantidad || datos.cantidad || 3);
        let montoCrudo = String(datos.valorMonto || datos.monto || '80000');
        let valorMonto = parseFloat(montoCrudo.replace(/\./g, '').replace(',', '.')) || 0;

        const estructuraFinal = {
            habilitado: !!habilitado,
            modo: modo,
            valorCantidad: valorCantidad,
            valorMonto: valorMonto
        };

        await pool.query(
            'INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = $2', 
            ['mayorista', JSON.stringify(estructuraFinal)]
        );

        await logActividad(req.admin?.nombre || 'Admin', 'GUARDAR_MAYORISTA', `Modo: ${modo} | Min: ${valorCantidad}U / $${valorMonto}`, req);
        res.json({ success: true, mayorista: estructuraFinal });
    } catch (e) {
        console.error('❌ Error crítico al procesar configuración mayorista:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/save-diseno-config', adminMiddleware('config'), async (req, res) => { if(req.body.diseno) await setConfig('diseno', req.body.diseno); res.json({ success: true }); });
app.post('/save-home-config', adminMiddleware('config'), async (req, res) => { if(req.body.heroConfig) await setConfig('heroConfig', req.body.heroConfig); res.json({ success: true }); });
app.post('/save-plantilla', adminMiddleware('web'), async (req, res) => { await setConfig('plantilla', req.body.plantilla); res.json({ success: true }); });
app.post('/save-icono', adminMiddleware('web'), async (req, res) => { await setConfig('icono', req.body.icono); res.json({ success: true }); });

app.post('/confirmar-venta', async (req, res) => {
    try {
        const { carrito, pago, logistica, cliente } = req.body;
        if (!carrito?.length) return res.status(400).json({ error: 'Carrito vacío' });
        for (let it of carrito) {
            if (it.esManual) continue;
            const stockActual = (await pool.query('SELECT stock FROM variantes WHERE "productoId"=$1 AND nombre=$2', [it.pId, it.vNom])).rows[0];
            if (!stockActual || stockActual.stock < it.cant) return res.status(400).json({ error: `Stock insuficiente: ${it.pNom} - ${it.vNom}. Disponible: ${stockActual?.stock || 0}` });
        }
        for (let it of carrito) { if(it.esManual) continue; await pool.query('UPDATE variantes SET stock=stock-$1 WHERE "productoId"=$2 AND nombre=$3', [it.cant, it.pId, it.vNom]); }
        const id = 'FAC-' + Date.now();
        await pool.query("INSERT INTO ventas (id,fecha,\"fechaTimestamp\",items,total,\"metodoPago\",logistica,cliente,estado,origen) VALUES ($1,TO_CHAR(NOW(),'DD/MM/YYYY HH24:MI:SS'),$2,$3,$4,$5,$6,$7,'completada','admin')",
            [id, Date.now(), JSON.stringify(carrito), pago.total, pago.metodo, logistica, JSON.stringify(cliente||{nombre:'Mostrador'})]);
        await crearNotificacion('venta', '💰 Venta', `${id}`);
        await logActividad(req.admin?.nombre || 'Admin', 'VENTA', `Venta ${id}`, req);
        res.json({ success: true, ventaId: id });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/listar-ventas', async (req, res) => {
    const ventas = (await pool.query('SELECT * FROM ventas ORDER BY "fechaTimestamp" DESC')).rows;
    res.json({ lista: ventas.map(v => ({ ...v, items: JSON.parse(v.items||'[]'), cliente: JSON.parse(v.cliente||'{}'), pago: { total: v.total, metodo: v["metodoPago"] } })) });
});

app.post('/corte-caja', async (req, res) => {
    const v = (await pool.query("SELECT COALESCE(SUM(total),0) as total, COUNT(*) as cantidad FROM ventas WHERE fecha LIKE TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') || '%'")).rows[0];
    res.json({ total: v.total, cantidad: v.cantidad });
});

app.post('/tienda/listar-productos', async (req, res) => {
    const c = await getConfig();
    const prods = (await pool.query('SELECT * FROM productos ORDER BY id DESC')).rows;
    for (const p of prods) p.variantes = (await pool.query('SELECT * FROM variantes WHERE "productoId"=$1', [p.id])).rows;
    const cats = (await pool.query('SELECT * FROM categorias')).rows;
    const metodos = (await pool.query('SELECT nombre FROM metodos_envio')).rows;
    res.json({ productos: prods, categorias: cats.map(x => ({ ...x, subcategorias: JSON.parse(x.subcategorias||'[]') })), metodosEnvio: metodos.map(m => m.nombre), configuracion: c });
});

app.post('/tienda/crear-pedido', authMiddleware, async (req, res) => {
    try {
        const carritoCrudo = req.body.carrito || req.body.items || req.body.productos;
        const { cliente, total, tipoEntrega, metodoEnvio, esMayorista, razonMayorista } = req.body;
        
        const carrito = typeof carritoCrudo === 'string' ? JSON.parse(carritoCrudo) : (carritoCrudo || []);

        if (!carrito || carrito.length === 0) {
            return res.status(400).json({ error: 'Tu pedido está vacío. Agregá productos en la tienda antes de finalizar.' });
        }

        const u = (await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.usuario.id])).rows[0];
        if (!u) return res.status(404).json({ error: 'Usuario no encontrado en el sistema.' });

        const clienteFinal = cliente || {};
        clienteFinal.nombre = u.nombre || clienteFinal.nombre || '';
        clienteFinal.apellido = u.apellido || clienteFinal.apellido || '';
        clienteFinal.email = u.email || clienteFinal.email || '';
        clienteFinal.dni = u.dni || clienteFinal.dni || '';

        for (let it of carrito) {
            if (it.esManual) continue;
            const pId = it.pId || it.id || it.productoId;
            const varianteNom = it.vNom || it.variante || '';
            if (!pId) continue;

            const stockActual = (await pool.query('SELECT stock FROM variantes WHERE "productoId" = $1 AND nombre = $2', [pId, varianteNom])).rows[0];
            if (!stockActual || stockActual.stock < it.cant) {
                return res.status(400).json({ 
                    error: `Stock insuficiente para: ${it.pNom || 'Producto'} (${varianteNom}). Disponible: ${stockActual?.stock || 0} unidades.` 
                });
            }
        }

        for (let it of carrito) {
            if (it.esManual) continue;
            const pId = it.pId || it.id || it.productoId;
            const varianteNom = it.vNom || it.variante || '';
            if (!pId) continue;
            await pool.query('UPDATE variantes SET stock = stock - $1 WHERE "productoId" = $2 AND nombre = $3', [it.cant, pId, varianteNom]);
        }

        const id = 'PED-' + Date.now();
        const totalFinal = total || carrito.reduce((s, i) => s + (i.precio * i.cant), 0);
        const entrega = tipoEntrega || 'local';
        const envio = metodoEnvio || '';
        const esMayoristaFinal = esMayorista ? 1 : 0;

        await pool.query(
            `INSERT INTO pedidos (
                id, fecha, "fechaTimestamp", items, total, cliente, 
                "tipoEntrega", "metodoEnvio", estado, origen, "usuarioId", "esMayorista", "razonMayorista"
             ) VALUES ($1, TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS'), $2, $3, $4, $5, $6, $7, 'pendiente', 'tienda', $8, $9, $10)`,
            [
                id, Date.now(), JSON.stringify(carrito), totalFinal, JSON.stringify(clienteFinal), 
                entrega, envio, u.id, esMayoristaFinal, razonMayorista || ''
            ]
        );

        await crearNotificacion('pedido', '🛍️ Nuevo pedido', `#${id}`);
        await logActividad(clienteFinal.nombre, 'PEDIDO_WEB', `Pedido online generado con éxito #${id}`, req);
        return res.json({ success: true, pedidoId: id });
    } catch (e) {
        console.error('❌ Error crítico en el proceso de checkout:', e.message);
        return res.status(500).json({ error: 'Error interno del servidor al procesar el checkout.' });
    }
});

app.post('/tienda/listar-pedidos', async (req, res) => {
    const pedidos = (await pool.query('SELECT * FROM pedidos ORDER BY "fechaTimestamp" DESC')).rows;
    res.json({ lista: pedidos.map(p => ({ ...p, items: JSON.parse(p.items||'[]'), cliente: JSON.parse(p.cliente||'{}') })) });
});

// 1. ENDPOINT PARA CONFIRMAR EL PEDIDO (Pasa a confirmado, controla stock, pero NO genera PIN ni asienta venta)
app.post('/tienda/confirmar-pedido', async (req, res) => {
    try {
        const { pedidoId } = req.body;
        const p = (await pool.query('SELECT * FROM pedidos WHERE id=$1 AND estado=$2', [pedidoId, 'pendiente'])).rows[0];
        
        if (!p) return res.status(400).json({ error: 'Pedido no encontrado o ya procesado.' });
        
        // Solo cambiamos el estado para apartar la mercadería, sin generar PIN
        await pool.query('UPDATE pedidos SET estado=$1 WHERE id=$2', ['confirmado', p.id]);
        await logActividad('Admin', 'CONFIRMAR_PEDIDO', `Pedido ${p.id} aprobado (Espera pago)`, req);
        
        return res.json({ success: true, estado: 'confirmado' });

    } catch(e) { 
        console.error('❌ Error al confirmar pedido:', e.message);
        if (!res.headersSent) res.status(500).json({ error: e.message }); 
    }
});

// 1. ENDPOINT MARCAR ABONADO MODIFICADO (Detecta si genera PIN o no)
app.post('/tienda/marcar-abonado', async (req, res) => {
    try {
        const { pedidoId } = req.body;
        const p = (await pool.query('SELECT * FROM pedidos WHERE id=$1 AND estado=$2', [pedidoId, 'confirmado'])).rows[0];
        
        if (!p) return res.status(400).json({ error: 'El pedido debe estar verificado antes de marcarlo como abonado.' });
        
        let pin = null;
        // >>> REGLA CRÍTICA: Solo genera PIN si el tipo de entrega NO es envío <<<
        if (p["tipoEntrega"] !== 'envio') {
            pin = generarPIN();
        }
        
        const vid = 'FAC-' + Date.now();

        // Asentamos la venta en tu caja/historial general
        await pool.query("INSERT INTO ventas (id,fecha,\"fechaTimestamp\",items,total,\"metodoPago\",logistica,cliente,estado,origen,\"pedidoId\") VALUES ($1,TO_CHAR(NOW(),'DD/MM/YYYY HH24:MI:SS'),$2,$3,$4,'pedido_online',$5,$6,'completada','tienda',$7)",
            [vid, Date.now(), p.items, p.total, p["tipoEntrega"]==='envio'?'envio':'local', p.cliente, p.id]);
        
        // Guardamos los cambios en Postgres (Si es envío, el campo pin queda como NULL)
        await pool.query('UPDATE pedidos SET estado=$1, pin=$2, "ventaId"=$3 WHERE id=$4', ['abonado', pin, vid, p.id]);
        await logActividad('Admin', 'PEDIDO_ABONADO', `Pedido ${p.id} marcado como abonado.`, req);
        
        res.json({ success: true, estado: 'abonado', pin: pin, tipoEntrega: p["tipoEntrega"] });

        // Enviar Email avisando del pago
        const cliente = JSON.parse(p.cliente||'{}');
        if (cliente.email) {
            let mensajeMail = `<h3>¡Recibimos tu pago con éxito!</h3><p>Tu pedido ya está siendo preparado para el despacho a tu domicilio.</p>`;
            if (pin) {
                mensajeMail = `<h3>¡Recibimos tu pago con éxito!</h3><p>Ya podés pasar a retirar tu pedido utilizando el siguiente código:</p><div style="background:#FEFAE0; padding:15px; font-size:24px; font-weight:bold; text-align:center; border:1px solid #D4A373;">${pin}</div>`;
            }
            enviarEmail(cliente.email, `💳 Pago Confirmado - Pedido #${p.id}`, `<h1>ESENCIA CURVY</h1>${mensajeMail}`).catch(err => console.error(err));
        }

    } catch(e) {
        console.error('❌ Error en marcar abonado:', e.message);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

// 2. NUEVO ENDPOINT PARA CAMBIAR A ENVIADO (Para finalizar el circuito de envíos)
app.post('/tienda/marcar-enviado', async (req, res) => {
    try {
        const { pedidoId } = req.body;
        const p = (await pool.query('SELECT * FROM pedidos WHERE id=$1 AND estado=$2', [pedidoId, 'abonado'])).rows[0];
        
        if (!p) return res.status(400).json({ error: 'Pedido no encontrado o no está en estado abonado.' });
        
        // Pasamos el pedido a enviado (o entregado para cerrar el circuito)
        await pool.query('UPDATE pedidos SET estado=$1 WHERE id=$2', ['enviado', p.id]);
        await logActividad('Admin', 'PEDIDO_ENVIADO', `Pedido ${p.id} despachado por transporte`, req);
        
        return res.json({ success: true, estado: 'enviado' });
    } catch(e) {
        console.error('❌ Error al marcar enviado:', e.message);
        return res.status(500).json({ error: e.message });
    }
});

app.post('/tienda/cancelar-pedido', authMiddleware, async (req, res) => {
    const p = (await pool.query('SELECT * FROM pedidos WHERE id=$1 AND "usuarioId"=$2 AND estado=$3', [req.body.pedidoId, req.usuario.id, 'pendiente'])).rows[0];
    if (!p) return res.status(400).json({ error: 'No se puede cancelar' });
    JSON.parse(p.items||'[]').forEach(async it => { if(!it.esManual) await pool.query('UPDATE variantes SET stock=stock+$1 WHERE "productoId"=$2 AND nombre=$3', [it.cant, it.pId, it.vNom]); });
    await pool.query("UPDATE pedidos SET estado='cancelado' WHERE id=$1", [p.id]);
    await logActividad('Sistema', 'CANCELAR_PEDIDO', `Pedido ${p.id} cancelado`, req);
    res.json({ success: true });
});

app.post('/tienda/marcar-abonado', async (req, res) => {
    await pool.query("UPDATE pedidos SET estado='abonado' WHERE id=$1", [req.body.pedidoId]);
    await logActividad('Admin', 'PEDIDO_ABONADO', `Pedido ${req.body.pedidoId} abonado`, req);
    res.json({ success: true });
});

app.post('/tienda/marcar-enviado', async (req, res) => {
    await pool.query("UPDATE pedidos SET estado='enviado' WHERE id=$1", [req.body.pedidoId]);
    await logActividad('Admin', 'PEDIDO_ENVIADO', `Pedido ${req.body.pedidoId} enviado`, req);
    res.json({ success: true });
});

app.post('/tienda/marcar-entregado', async (req, res) => { await pool.query("UPDATE pedidos SET estado='entregado' WHERE id=$1", [req.body.pedidoId]); res.json({ success: true }); });
app.post('/tienda/cancelar-pedido-admin', async (req, res) => {
    const p = (await pool.query('SELECT * FROM pedidos WHERE id=$1', [req.body.pedidoId])).rows[0];
    if (!p) return res.status(400).json({ error: 'No encontrado' });
    JSON.parse(p.items||'[]').forEach(async it => { if(!it.esManual) await pool.query('UPDATE variantes SET stock=stock+$1 WHERE "productoId"=$2 AND nombre=$3', [it.cant, it.pId, it.vNom]); });
    await pool.query("UPDATE pedidos SET estado='cancelado' WHERE id=$1", [p.id]);
    res.json({ success: true });
});

app.post('/tienda/retirar-pedido', async (req, res) => {
    const p = (await pool.query('SELECT * FROM pedidos WHERE id=$1 AND pin=$2', [req.body.pedidoId, req.body.pin])).rows[0];
    if (!p) return res.status(400).json({ error: 'PIN incorrecto' });
    await pool.query("UPDATE pedidos SET estado='entregado' WHERE id=$1", [p.id]);
    await logActividad('Admin', 'RETIRO_PEDIDO', `Pedido ${req.body.pedidoId} retirado`, req);
    res.json({ success: true });
});

app.post('/tienda/verificar-pin', async (req, res) => {
    const p = (await pool.query("SELECT * FROM pedidos WHERE pin=$1 AND estado IN ('confirmado','abonado')", [req.body.pin])).rows[0];
    if (!p) return res.status(400).json({ error: 'PIN no encontrado' });
    res.json({ success: true, pedido: { ...p, cliente: JSON.parse(p.cliente||'{}'), items: JSON.parse(p.items||'[]') } });
});

app.post('/dashboard/stats', async (req, res) => {
    const v = (await pool.query("SELECT COUNT(*) as c, COALESCE(SUM(total),0) as t FROM ventas WHERE fecha LIKE TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') || '%'")).rows[0];
    res.json({ ventasHoy: v.c, totalHoy: v.t });
});

app.post('/admin/estadisticas-avanzadas', adminMiddleware('dashboard'), async (req, res) => {
    try {
        const hoy = new Date().toLocaleDateString('es-AR');
        const mes = new Date().toLocaleDateString('es-AR').substring(3);
        
        const ventasHoyQuery = await pool.query("SELECT COALESCE(SUM(total),0) as total FROM ventas WHERE fecha LIKE $1", [`%${hoy}%`]);
        const ventasHoy = parseFloat(ventasHoyQuery.rows[0].total);

        const mesQueryStr = mes.length === 6 ? `0${mes}` : mes;
        const ventasMesQuery = await pool.query("SELECT * FROM ventas WHERE fecha LIKE $1", [`%${mesQueryStr}%`]);
        const ventasMesRows = ventasMesQuery.rows;
        
        let ventasMes = 0;
        let efAdmin = 0, trAdmin = 0, efWeb = 0, trWeb = 0;
        
        ventasMesRows.forEach(v => {
            ventasMes += v.total || 0;
            if (v.origen === 'admin') {
                if (v.metodoPago === 'efectivo') efAdmin += v.total;
                if (v.metodoPago === 'transferencia') trAdmin += v.total;
            }
            if (v.origen === 'tienda') trWeb += v.total;
        });

        const totalClientes = (await pool.query('SELECT COUNT(*) as c FROM usuarios')).rows[0].c;
        const totalProductos = (await pool.query('SELECT COUNT(*) as c FROM productos')).rows[0].c;
        const pedidosPendientes = (await pool.query("SELECT COUNT(*) as c FROM pedidos WHERE estado IN ('pendiente','confirmado','abonado')")).rows[0].c;
        
        const prodAgotadosQuery = await pool.query(`
            SELECT COUNT(*) as c FROM productos p 
            WHERE NOT EXISTS (
                SELECT 1 FROM variantes v WHERE v."productoId" = p.id AND v.stock > 0
            )
        `);
        const productosAgotados = parseInt(prodAgotadosQuery.rows[0].c || 0);

        res.json({
            ventasHoy,
            ventasMes,
            totalClientes,
            totalProductos,
            pedidosPendientes,
            productosAgotados,
            rendimientoMensual: { efAdmin, trAdmin, efWeb, trWeb, total: efAdmin + trAdmin + efWeb + trWeb }
        });
    } catch (e) {
        console.error('❌ Error en adelantado de estadisticas:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/admin/listar-clientes', adminMiddleware('clientes'), async (req, res) => {
    try {
        const clientes = (await pool.query('SELECT id, nombre, apellido, email, telefono, dni, provincia, localidad FROM usuarios WHERE rol = $1 ORDER BY "fechaRegistro" DESC LIMIT 200', ['cliente'])).rows;
        res.json({ lista: clientes });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/buscar-clientes', adminMiddleware(), async (req, res) => {
    const q = `%${req.body.query||''}%`;
    const clientes = (await pool.query('SELECT id, nombre, apellido, email, telefono, dni FROM usuarios WHERE nombre ILIKE $1 OR apellido ILIKE $1 OR email ILIKE $1 OR dni ILIKE $1 LIMIT 20', [q])).rows;
    res.json({ lista: clientes });
});

app.post('/admin/eliminar-cliente', async (req, res) => {
    try {
        const { id, adminPassword } = req.body;
        if (!id) return res.status(400).json({ error: 'Falta el ID del cliente a eliminar.' });
        if (!adminPassword || !adminPassword.trim()) {
            return res.status(400).json({ error: 'La contraseña de administrador es obligatoria.' });
        }

        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No autorizado: Falta el token de acceso.' });

        let adminDecoded;
        try {
            adminDecoded = jwt.verify(token, JWT_SECRET);
        } catch(err) {
            return res.status(401).json({ error: 'Sesión inválida o expirada. Por favor, refrescá la página.' });
        }

        const queryAdmin = await pool.query(
            `SELECT * FROM perfiles 
             WHERE (usuario = $1 OR nombre = $2 OR id = $3 OR usuario = 'admin') 
             AND activo = 1 
             ORDER BY (usuario = 'admin') DESC LIMIT 1`,
            [adminDecoded.usuario || '', adminDecoded.nombre || '', adminDecoded.id || '']
        );

        const adminPerfil = queryAdmin.rows[0];
        if (!adminPerfil) {
            return res.status(404).json({ error: 'Perfil de administrador no encontrado en la base de datos.' });
        }

        const passwordCorrecta = await bcrypt.compare(adminPassword.trim(), adminPerfil.password);
        if (!passwordCorrecta) {
            return res.status(401).json({ error: 'Contraseña de administrador incorrecta. Operación denegada.' });
        }

        const clienteCheck = await pool.query('SELECT email FROM usuarios WHERE id = $1', [id]);
        if (clienteCheck.rows.length === 0) {
            return res.status(404).json({ error: 'El cliente seleccionado ya no existe en el sistema.' });
        }
        const emailCliente = clienteCheck.rows[0].email;

        const resultadoDelete = await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        
        if (resultadoDelete.rowCount > 0) {
            await logActividad(adminPerfil.nombre, 'ELIMINAR_CLIENTE', `Borró al cliente: ${emailCliente}`, req);
            return res.json({ success: true, message: 'Cliente eliminado correctamente.' });
        } else {
            return res.status(500).json({ error: 'No se pudo ejecutar la eliminación en la base de datos.' });
        }
    } catch (e) {
        console.error('❌ Error crítico en eliminar-cliente final:', e.message);
        return res.status(500).json({ error: 'Error interno del servidor: ' + e.message });
    }
});

app.post('/admin/historial-cliente', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID de cliente requerido' });

        const pedidos = (await pool.query('SELECT * FROM pedidos WHERE "usuarioId" = $1 ORDER BY "fechaTimestamp" DESC', [id])).rows;
        
        const clienteData = (await pool.query('SELECT email FROM usuarios WHERE id = $1', [id])).rows[0];
        let ventas = [];
        
        if (clienteData?.email) {
            const ventasQuery = await pool.query('SELECT * FROM ventas WHERE cliente::text ILIKE $1 ORDER BY "fechaTimestamp" DESC', [`%${clienteData.email}%`]);
            ventas = ventasQuery.rows;
        }

        return res.json({
            success: true,
            pedidos: pedidos.map(p => ({ ...p, items: JSON.parse(p.items || '[]'), cliente: JSON.parse(p.cliente || '{}') })),
            ventas: ventas.map(v => ({ ...v, items: JSON.parse(v.items || '[]'), cliente: JSON.parse(v.cliente || '{}') }))
        });
    } catch (e) {
        console.error('❌ Error al traer historial del cliente:', e.message);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/admin/listar-costos', adminMiddleware('ventas'), async (req, res) => {
    try {
        const costos = (await pool.query('SELECT * FROM costos_producto')).rows;
        res.json({ lista: costos });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/guardar-costos', adminMiddleware('ventas'), async (req, res) => {
    try {
        const { productoId, costo, flete, adicionales } = req.body;
        const existe = (await pool.query('SELECT id FROM costos_producto WHERE "productoId"=$1', [productoId])).rows[0];
        if (existe) {
            await pool.query('UPDATE costos_producto SET costo=$1, flete=$2, adicionales=$3, "fechaActualizacion"=$4 WHERE "productoId"=$5',
                [costo||0, flete||0, JSON.stringify(adicionales||[]), Date.now(), productoId]);
        } else {
            await pool.query('INSERT INTO costos_producto ("productoId", costo, flete, adicionales, "fechaActualizacion") VALUES ($1,$2,$3,$4,$5)',
                [productoId, costo||0, flete||0, JSON.stringify(adicionales||[]), Date.now(), productoId]);
        }
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/rendimiento-historico', adminMiddleware('ventas'), async (req, res) => {
    try {
        const { productoId, desde, hasta } = req.body;
        let query = "SELECT * FROM ventas WHERE items::text LIKE $1";
        let params = [`%${productoId}%`];
        if (desde) { query += " AND fecha >= $" + (params.length+1); params.push(desde); }
        if (hasta) { query += " AND fecha <= $" + (params.length+1); params.push(hasta); }
        query += " ORDER BY \"fechaTimestamp\" DESC LIMIT 200";
        
        const ventas = (await pool.query(query, params)).rows;
        const costos = (await pool.query('SELECT * FROM costos_producto WHERE "productoId"=$1', [productoId])).rows[0];
        const costoData = costos || { costo: 0, flete: 0, adicionales: [] };
        const adicionales = JSON.parse(costoData.adicionales || '[]');
        const costoBase = (costoData.costo || 0) + (costoData.flete || 0) + adicionales.reduce((s, a) => s + (a.monto || 0), 0);
        
        const resultado = [];
        ventas.forEach(v => {
            const items = JSON.parse(v.items || '[]');
            items.forEach(it => {
                if (it.pId == productoId) {
                    resultado.push({
                        fecha: v.fecha,
                        ventaId: v.id,
                        amount: it.cant,
                        precio: it.precio,
                        precioOriginal: it.precioOriginal || it.precio,
                        esMayorista: it.precioOriginal && it.precio < it.precioOriginal,
                        costo: costoBase
                    });
                }
            });
        });
        
        res.json({ ventas: resultado });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/exportar-ventas', adminMiddleware(), async (req, res) => {
    let csv = '\uFEFFFecha;ID;Cliente;Total;Pago;Origen\n';
    const ventas = (await pool.query('SELECT * FROM ventas ORDER BY "fechaTimestamp" DESC')).rows;
    ventas.forEach(v => { const c = JSON.parse(v.cliente||'{}'); csv += `"${v.fecha}";"${v.id}";"${c.nombre||'Mostrador'}";"${v.total}";"${v["metodoPago"]}";"${v.origen}"\n`; });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=ventas.csv');
    res.send(csv);
});

app.post('/admin/apertura-caja-profesional', adminMiddleware('ventas'), async (req, res) => {
    try {
        const { montoEfectivo, montoTransferencia } = req.body;
        const hoy = new Date().toLocaleDateString('es-AR');
        const existe = (await pool.query('SELECT * FROM caja_profesional WHERE fecha = $1', [hoy])).rows[0];
        
        if (existe) {
            if (existe.estado === 'abierta') {
                return res.status(400).json({ error: 'La caja ya se encuentra abierta' });
            }
            await pool.query(`
                UPDATE caja_profesional 
                SET estado = 'abierta', 
                    "montoInicialEfectivo" = $1, 
                    "montoInicialTransferencia" = $2, 
                    "aperturaTimestamp" = $3, 
                    "abiertaPor" = $4,
                    "cerradaPor" = NULL, 
                    "cierreTimestamp" = NULL,
                    "efectivoEntregado" = 0,
                    "transferenciaEntregada" = 0,
                    "diferenciaEfectivo" = 0,
                    "diferenciaTransferencia" = 0
                WHERE fecha = $5
            `, [montoEfectivo || 0, montoTransferencia || 0, Date.now(), req.admin.nombre, hoy]);
            
            await logActividad(req.admin.nombre, 'REAPERTURA_CAJA', `Ef: ${fmt.format(montoEfectivo||0)} | Transf: ${fmt.format(montoTransferencia||0)}`, req);
        } else {
            await pool.query(`
                INSERT INTO caja_profesional (fecha, "aperturaTimestamp", "abiertaPor", "montoInicialEfectivo", "montoInicialTransferencia", estado) 
                VALUES ($1,$2,$3,$4,$5,'abierta')
            `, [hoy, Date.now(), req.admin.nombre, montoEfectivo || 0, montoTransferencia || 0]);
            
            await logActividad(req.admin.nombre, 'APERTURA_CAJA', `Ef: ${fmt.format(montoEfectivo||0)} | Transf: ${fmt.format(montoTransferencia||0)}`, req);
        }
        res.json({ success: true });
    } catch(e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/admin/agregar-gasto', adminMiddleware('ventas'), async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS gastos (
                id SERIAL PRIMARY KEY,
                fecha TEXT,
                tipo TEXT,
                nombre TEXT,
                monto NUMERIC,
                usuario TEXT,
                timestamp BIGINT
            )
        `);
        
        const ahora = new Date();
        const d = ahora.getDate();
        const m = ahora.getMonth() + 1;
        const y = ahora.getFullYear();
        const f1 = `${d}/${m}/${y}`;
        const f2 = `${d.toString().padStart(2,'0')}/${m.toString().padStart(2,'0')}/${y}`;

        const cajaAbiertaHoy = (await pool.query(
            "SELECT * FROM caja_profesional WHERE estado = 'abierta' AND (fecha = $1 OR fecha = $2)", 
            [f1, f2]
        )).rows[0];
        
        if (!cajaAbiertaHoy) {
            return res.json({ 
                success: false, 
                error: '🔒 Operación denegada: No hay ninguna caja abierta el día de hoy. Debe realizar la Apertura de Caja obligatoriamente.' 
            });
        }

        const { tipo, nombre, monto } = req.body;
        await pool.query(`
            INSERT INTO gastos (fecha, tipo, nombre, monto, usuario, timestamp)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [f2, tipo, nombre, parseFloat(monto), req.admin.nombre, Date.now()]);
        
        res.json({ success: true });
    } catch (e) {
        console.error('❌ Error al registrar gasto:', e.message);
        res.json({ success: false, error: 'Error interno: ' + e.message });
    }
});

app.post('/admin/cierre-caja-profesional', adminMiddleware('ventas'), async (req, res) => {
    try {
        const { efectivoEntregado } = req.body;
        
        const caja = (await pool.query("SELECT * FROM caja_profesional WHERE estado = 'abierta'")).rows[0];
        if (!caja) return res.status(400).json({ error: 'No hay ninguna caja abierta en el sistema' });
        
        const abiertaPor = caja.abiertaPor || caja.abiertapor;
        if (abiertaPor !== req.admin.nombre && req.admin.rol !== 'admin') {
            return res.status(403).json({ error: `Esta caja fue abierta por ${abiertaPor}. Solo ese usuario o un Administrador pueden cerrarla.` });
        }

        const aperturaTimestamp = Number(caja.aperturaTimestamp || caja.aperturatimestamp || 0);
        const cierreTimestamp = Date.now(); 
        const hoyCajaStr = caja.fecha; 

        const montoInicialEfectivo = parseFloat(caja.montoInicialEfectivo || caja.montoinicialefectivo || 0);

        const ventasAdmin = (await pool.query(
            'SELECT * FROM ventas WHERE "fechaTimestamp" >= $1 AND "fechaTimestamp" <= $2', 
            [aperturaTimestamp, cierreTimestamp]
        )).rows;
        
        let ventasEfectivo = 0, ventasTransferencia = 0;
        ventasAdmin.forEach(v => {
            if (v.origen === 'admin') {
                if (v.metodoPago === 'efectivo') ventasEfectivo += v.total;
                if (v.metodoPago === 'transferencia') ventasTransferencia += v.total;
            }
        });

        const pedidosWebQuery = await pool.query(
            'SELECT COALESCE(SUM(total),0) as total FROM pedidos WHERE estado = \'abonado\' AND "fechaTimestamp" >= $1 AND "fechaTimestamp" <= $2', 
            [aperturaTimestamp, cierreTimestamp]
        );
        const ventasWebTransferencia = parseFloat(pedidosWebQuery.rows[0].total || 0);

        await pool.query(`CREATE TABLE IF NOT EXISTS gastos (id SERIAL PRIMARY KEY, fecha TEXT, tipo TEXT, nombre TEXT, monto NUMERIC, usuario TEXT, timestamp BIGINT)`);
        const gastosRows = (await pool.query(
            'SELECT * FROM gastos WHERE timestamp >= $1 AND timestamp <= $2', 
            [aperturaTimestamp, cierreTimestamp]
        )).rows;
        
        let listaGastosEfectivo = [];
        let listaGastosTransferencia = [];
        let totalGastosEfectivo = 0;
        let totalGastosTransferencia = 0;

        gastosRows.forEach(g => {
            const montoGasto = parseFloat(g.monto || 0);
            if (g.tipo === 'efectivo') {
                totalGastosEfectivo += montoGasto;
                listaGastosEfectivo.push({ nombre: g.nombre, monto: montoGasto });
            } else if (g.tipo === 'transferencia') {
                totalGastosTransferencia += montoGasto;
                listaGastosTransferencia.push({ nombre: g.nombre, monto: montoGasto });
            }
        });

        const totalEsperadoEfectivo = montoInicialEfectivo + ventasEfectivo - totalGastosEfectivo;
        const diferenciaEfectivo = totalEsperadoEfectivo - (efectivoEntregado || 0);
        const totalEsperadoTransferencia = ventasTransferencia + ventasWebTransferencia - totalGastosTransferencia;

        const accionLog = abiertaPor !== req.admin.nombre ? 'CIERRE_FORZADO_CAJA' : 'CIERRE_CAJA';

        await pool.query(`UPDATE caja_profesional SET estado='cerrada', "cerradaPor"=$1, "cierreTimestamp"=$2,
            "efectivoEntregado"=$3, "ventasEfectivo"=$4, "ventasTransferencia"=$5,
            "ventasWebTransferencia"=$6, "totalEsperadoEfectivo"=$7, "totalEsperadoTransferencia"=$8,
            "diferenciaEfectivo"=$9, "cantidadVentas"=$10 WHERE fecha=$11 AND estado='abierta'`,
            [req.admin.nombre, cierreTimestamp, efectivoEntregado||0, ventasEfectivo, ventasTransferencia,
             ventasWebTransferencia, totalEsperadoEfectivo, totalEsperadoTransferencia, diferenciaEfectivo,
             ventasAdmin.length, hoyCajaStr]);
             
        await logActividad(req.admin.nombre, accionLog, `Dif Ef: ${fmt.format(diferenciaEfectivo)}`, req);
        
        res.json({ 
            success: true, 
            resumen: { 
                abiertaPor,
                aperturaTimestamp,
                montoInicialEfectivo, 
                ventasEfectivo, 
                totalGastosEfectivo,
                listaGastosEfectivo,
                totalEsperadoEfectivo, 
                efectivoEntregado,
                diferenciaEfectivo,
                ventasTransferencia, 
                ventasWebTransferencia, 
                totalGastosTransferencia,
                listaGastosTransferencia,
                totalEsperadoTransferencia,
                cantidadVentas: ventasAdmin.length
            } 
        });
    } catch(e) { 
        console.error("❌ Error en cierre de caja por rango horaria:", e.message);
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/admin/estado-caja-profesional', adminMiddleware('ventas'), async (req, res) => {
    try {
        const hoy = new Date().toLocaleDateString('es-AR');
        const caja = (await pool.query("SELECT * FROM caja_profesional WHERE fecha = $1 AND estado = 'abierta'", [hoy])).rows[0];
        if (!caja) return res.json({ abierta: false });
        const ventasAdmin = (await pool.query("SELECT * FROM ventas WHERE fecha LIKE $1", [`%${hoy}%`])).rows;
        let ventasEfectivo = 0, ventasTransferencia = 0, ventasWeb = 0;
        ventasAdmin.forEach(v => {
            if (v.origen === 'admin') {
                if (v["metodoPago"] === 'efectivo') ventasEfectivo += v.total;
                if (v["metodoPago"] === 'transferencia') ventasTransferencia += v.total;
            }
            if (v.origen === 'tienda') ventasWeb += v.total;
        });
        res.json({ abierta: true, abiertaPor: caja.abiertapor, montoInicialEfectivo: caja.montoinicialefectivo, montoInicialTransferencia: caja.montoinicialtransferencia, ventasEfectivo, ventasTransferencia, ventasWeb, totalEsperadoEfectivo: caja.montoinicialefectivo + ventasEfectivo, totalEsperadoTransferencia: caja.montoinicialtransferencia + ventasTransferencia + ventasWeb, cantidadVentas: ventasAdmin.length });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/historial-cajas', adminMiddleware('dashboard'), async (req, res) => {
    try {
        const { desde, hasta } = req.body;
        let query = "SELECT * FROM caja_profesional WHERE estado = 'cerrada'";
        let params = [];
        if (desde) { query += " AND fecha >= $" + (params.length+1); params.push(desde); }
        if (hasta) { query += " AND fecha <= $" + (params.length+1); params.push(hasta); }
        query += " ORDER BY fecha DESC LIMIT 100";
        const cajas = (await pool.query(query, params)).rows;
        res.json({ lista: cajas });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/estadisticas-vendedor', adminMiddleware('dashboard'), async (req, res) => {
    const logs = (await pool.query("SELECT admin, accion, COUNT(*) as c FROM logs_admin WHERE accion IN ('VENTA','CONFIRMAR_PEDIDO') GROUP BY admin, accion")).rows;
    const v = {};
    logs.forEach(l => { if(!v[l.admin]) v[l.admin]={nombre:l.admin,ventas:0,pedidos:0}; if(l.accion==='VENTA')v[l.admin].ventas+=l.c; else v[l.admin].pedidos+=l.c; });
    res.json({ lista: Object.values(v) });
});

app.post('/admin/dashboard/data', adminMiddleware('dashboard'), async (req, res) => {
    try {
        const { periodo = 'mes' } = req.body;
        let fechaInicio;
        const ahora = new Date();
        switch (periodo) {
            case 'hoy': fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()); break;
            case 'semana': fechaInicio = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000); break;
            case 'mes': fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1); break;
            case 'anio': fechaInicio = new Date(ahora.getFullYear(), 0, 1); break;
            default: fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        }
        const ventasQuery = await pool.query("SELECT * FROM ventas WHERE \"fechaTimestamp\" >= $1", [fechaInicio.getTime()]);
        const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const ventasPorDia = [0, 0, 0, 0, 0, 0, 0];
        const efectivoPorDia = [0, 0, 0, 0, 0, 0, 0];
        const transferenciaPorDia = [0, 0, 0, 0, 0, 0, 0];
        
        ventasQuery.rows.forEach(v => {
            const ts = Number(v.fechaTimestamp);
            if (!isNaN(ts)) {
                const fecha = new Date(ts);
                const dia = fecha.getDay();
                ventasPorDia[dia] += v.total || 0;
                if (v.metodoPago === 'efectivo') efectivoPorDia[dia] += v.total || 0;
                if (v.metodoPago === 'transferencia') transferenciaPorDia[dia] += v.total || 0;
            }
        });
        
        const productosCount = {};
        ventasQuery.rows.forEach(v => {
            const items = typeof v.items === 'string' ? JSON.parse(v.items) : (v.items || []);
            items.forEach(i => { const key = i.pNom || 'Desconocido'; productosCount[key] = (productosCount[key] || 0) + (i.cant || 1); });
        });
        const productosTop = Object.entries(productosCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
        
        const categoriasCount = {};
        const productos = await pool.query('SELECT id, nombre, "categoriaId" FROM productos');
        const categorias = await pool.query('SELECT id, nombre FROM categorias');
        
        ventasQuery.rows.forEach(v => {
            const items = typeof v.items === 'string' ? JSON.parse(v.items) : (v.items || []);
            items.forEach(i => {
                const prod = productos.rows.find(p => p.id == i.pId);
                if (prod) { 
                    const cat = categorias.rows.find(c => c.id == prod.categoriaId); 
                    const catNombre = cat ? cat.nombre : 'Sin categoría'; 
                    categoriasCount[catNombre] = (categoriasCount[catNombre] || 0) + (i.precio * i.cant || 0); 
                }
            });
        });
        const categoriasTop = Object.entries(categoriasCount).sort((a, b) => b[1] - a[1]).slice(0, 7);
        
        res.json({
            ventasDia: { labels: diasSemana, valores: ventasPorDia },
            productosTop: { labels: productosTop.length ? productosTop.map(p => p[0]) : ['Sin datos'], valores: productosTop.length ? productosTop.map(p => p[1]) : [0] },
            metodosPago: { labels: diasSemana, efectivo: efectivoPorDia, transferencia: transferenciaPorDia },
            categorias: { labels: categoriasTop.length ? categoriasTop.map(c => c[0]) : ['Sin datos'], valores: categoriasTop.length ? categoriasTop.map(c => c[1]) : [0] }
        });
    } catch (error) { 
        console.error('❌ Error en dashboard data:', error); 
        res.status(500).json({ error: error.message });
    }
});

app.post('/notificaciones', async (req, res) => { res.json({ lista: (await pool.query('SELECT * FROM notificaciones ORDER BY fecha DESC LIMIT 50')).rows }); });
app.post('/notificaciones/leer', async (req, res) => { await pool.query('UPDATE notificaciones SET leida=1 WHERE id=$1', [req.body.id]); res.json({ success: true }); });
app.post('/notificaciones/leer-todas', async (req, res) => { await pool.query('UPDATE notificaciones SET leida=1'); res.json({ success: true }); });

app.post('/logs/admin', async (req, res) => {
    const { filtro, desde, hasta } = req.body;
    let query = 'SELECT * FROM logs_admin'; let params = []; let conditions = [];
    if (filtro) { conditions.push('(admin ILIKE $1 OR accion ILIKE $1 OR detalles ILIKE $1)'); params.push(`%${filtro}%`); }
    if (desde) { conditions.push(`fecha::date >= $${params.length+1}`); params.push(desde); }
    if (hasta) { conditions.push(`fecha::date <= $${params.length+1}`); params.push(hasta); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY fecha DESC LIMIT 500';
    const logs = (await pool.query(query, params)).rows;
    res.json({ lista: logs });
});

app.get('/api/mis-pedidos', authMiddleware, async (req, res) => {
    const pedidos = (await pool.query('SELECT * FROM pedidos WHERE "usuarioId"=$1 ORDER BY "fechaTimestamp" DESC', [req.usuario.id])).rows;
    res.json({ lista: pedidos.map(p => ({ ...p, items: JSON.parse(p.items||'[]'), cliente: JSON.parse(p.cliente||'{}') })) });
});

async function exportarTabla(nombreTabla) {
    const result = await pool.query(`SELECT * FROM ${nombreTabla}`);
    return result.rows;
}

app.post('/admin/backup/crear-total', adminMiddleware(), async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupId = `backup_total_${timestamp}`;
        const backupPath = path.join(BACKUP_DIR, backupId);
        fs.mkdirSync(backupPath, { recursive: true });
        console.log('📦 Iniciando backup total:', backupId);
        const datos = {
            metadata: { id: backupId, fecha: new Date().toISOString(), version: '2.0', tipo: 'total', sistema: 'ESENCIA CURVY POS Master' },
            productos: await exportarTabla('productos'), variantes: await exportarTabla('variantes'),
            categorias: await exportarTabla('categorias'), ventas: await exportarTabla('ventas'),
            pedidos: await exportarTabla('pedidos'), usuarios: await exportarTabla('usuarios'),
            notificaciones: await exportarTabla('notificaciones'), configuracion: await exportarTabla('configuracion'),
            metodos_envio: await exportarTabla('metodos_envio'), logs_admin: await exportarTabla('logs_admin'),
            perfiles: await exportarTabla('perfiles'), caja_profesional: await exportarTabla('caja_profesional'),
        };
        const stats = { productos: datos.productos.length, ventas: datos.ventas.length, usuarios: datos.usuarios.length, pedidos: datos.pedidos.length, imagenes: 0, totalRegistros: 0 };
        Object.values(datos).forEach(val => { if (Array.isArray(val)) stats.totalRegistros += val.length; });
        datos.metadata.stats = stats;
        fs.writeFileSync(path.join(backupPath, 'data.json'), JSON.stringify(datos, null, 2));
        const imagesDir = path.join(backupPath, 'imagenes'); fs.mkdirSync(imagesDir, { recursive: true });
        const uploadsDir = path.join(__dirname, 'uploads');
        if (fs.existsSync(uploadsDir)) {
            const copiarRecursivo = (src, dest) => {
                const entries = fs.readdirSync(src, { withFileTypes: true });
                for (let entry of entries) {
                    const srcPath = path.join(src, entry.name), destPath = path.join(dest, entry.name);
                    if (entry.isDirectory()) { fs.mkdirSync(destPath, { recursive: true }); copiarRecursivo(srcPath, destPath); }
                    else { fs.copyFileSync(srcPath, destPath); stats.imagenes++; }
                }
            };
            copiarRecursivo(uploadsDir, imagesDir);
        }
        datos.metadata.stats = stats;
        fs.writeFileSync(path.join(backupPath, 'data.json'), JSON.stringify(datos, null, 2));
        const zipFilename = `${backupId}.backup`, zipPath = path.join(BACKUP_DIR, zipFilename);
        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath), archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', resolve); archive.on('error', reject);
            archive.pipe(output); archive.directory(backupPath, backupId); archive.finalize();
        });
        fs.rmSync(backupPath, { recursive: true, force: true });
        const finalStats = fs.statSync(zipPath);
        await logActividad(req.admin.nombre, 'BACKUP_CREADO', `${stats.productos} prod, ${stats.ventas} ventas`, req);
        res.json({ success: true, id: backupId, filename: zipFilename, downloadUrl: `/admin/backup/descargar-archivo/${zipFilename}`, stats, tamano: (finalStats.size / 1024 / 1024).toFixed(2) });
    } catch (error) { console.error('❌ Error creando backup:', error); res.status(500).json({ error: 'Error al crear backup: ' + error.message }); }
});

app.post('/admin/backup/historial-total', adminMiddleware(), async (req, res) => {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return res.json({ backups: [] });
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.backup') || f.endsWith('.zip')).map(f => {
            const filePath = path.join(BACKUP_DIR, f), stats = fs.statSync(filePath);
            return { id: f.replace('.backup', '').replace('.zip', ''), nombre: f, fecha: stats.mtime.toISOString(), tamano: (stats.size / 1024 / 1024).toFixed(2), automatico: f.includes('auto_'), stats: { productos: '?', ventas: '?' } };
        }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        res.json({ backups: files });
    } catch (error) { res.json({ backups: [] }); }
});

const getAdminBackupFile = (req, res) => {
    const filePath = path.join(BACKUP_DIR, req.params.filename);
    if (fs.existsSync(filePath)) res.download(filePath);
    else res.status(404).json({ error: 'Archivo no encontrado' });
};
app.get('/admin/backup/descargar-archivo/:filename', adminMiddleware(), getAdminBackupFile);

app.post('/admin/backup/descargar-total', adminMiddleware(), (req, res) => {
    const { id } = req.body;
    for (let ext of ['.backup', '.zip']) { const filePath = path.join(BACKUP_DIR, id + ext); if (fs.existsSync(filePath)) return res.json({ url: `/admin/backup/descargar-archivo/${id}${ext}` }); }
    res.status(404).json({ error: 'Backup no encontrado' });
});

app.post('/admin/backup/eliminar-total', adminMiddleware(), async (req, res) => {
    try {
        const { id } = req.body;
        for (let ext of ['.backup', '.zip']) { const filePath = path.join(BACKUP_DIR, id + ext); if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); await logActividad(req.admin.nombre, 'BACKUP_ELIMINADO', id, req); return res.json({ success: true }); } }
        res.status(404).json({ error: 'Backup no encontrado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/admin/backup/restaurar-desde-archivo', adminMiddleware(), uploadBackup.single('backup'), async (req, res) => {
    const { password } = req.body;
    try {
        const adminPerfil = (await pool.query("SELECT * FROM perfiles WHERE usuario = $1", [req.admin.usuario])).rows[0];
        if (!(await bcrypt.compare(password, adminPerfil.password))) return res.status(403).json({ error: 'Contraseña incorrecta' });
        if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
        const tempDir = path.join(BACKUP_DIR, 'temp_restore_' + Date.now()); fs.mkdirSync(tempDir, { recursive: true });
        await fs.createReadStream(req.file.path).pipe(unzipper.Extract({ path: tempDir })).promise();
        let dataDir = tempDir;
        for (let file of fs.readdirSync(tempDir)) { const fullPath = path.join(tempDir, file); if (fs.statSync(fullPath).isDirectory()) { dataDir = fullPath; break; } }
        const dataPath = path.join(dataDir, 'data.json');
        if (!fs.existsSync(dataPath)) throw new Error('Archivo de datos no encontrado');
        const backup = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        await pool.query('DELETE FROM productos'); await pool.query('DELETE FROM variantes');
        await pool.query('DELETE FROM categorias'); await pool.query('DELETE FROM ventas');
        await pool.query('DELETE FROM pedidos'); await pool.query('DELETE FROM notificaciones');
        await pool.query('DELETE FROM configuracion');
        if (backup.productos) for (let p of backup.productos) await pool.query(`INSERT INTO productos (id, nombre, precio, "precioMayor", descripcion, "categoriaId", subcategoria, destacado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [p.id, p.nombre, p.precio, p.precioMayor||0, p.descripcion||'', p.categoriaId, p.subcategoria||'', p.destacado||0]);
        if (backup.variantes) for (let v of backup.variantes) await pool.query('INSERT INTO variantes ("productoId", nombre, stock, foto) VALUES ($1,$2,$3,$4)', [v.productoId, v.nombre, v.stock||0, v.foto||'']);
        if (backup.categorias) for (let c of backup.categorias) await pool.query('INSERT INTO categorias (id, nombre, subcategorias) VALUES ($1,$2,$3)', [c.id, c.nombre, c.subcategorias||'[]']);
        if (backup.configuracion) for (let c of backup.configuracion) await pool.query('INSERT INTO configuracion (clave, valor) VALUES ($1,$2) ON CONFLICT (clave) DO UPDATE SET valor = $2', [c.clave, c.valor]);
        const imagenesBackup = path.join(dataDir, 'imagenes');
        if (fs.existsSync(imagenesBackup)) { const upDir = path.join(__dirname, 'uploads'); if (fs.existsSync(upDir)) fs.rmSync(upDir, { recursive: true, force: true }); fs.mkdirSync(upDir, { recursive: true }); const copiarRec = (src, dest) => { for (let e of fs.readdirSync(src, { withFileTypes: true })) { const sp = path.join(src, e.name), dp = path.join(dest, e.name); if (e.isDirectory()) { fs.mkdirSync(dp, { recursive: true }); copiarRec(sp, dp); } else fs.copyFileSync(sp, dp); } }; copiarRec(imagenesBackup, upDir); }
        fs.rmSync(tempDir, { recursive: true, force: true }); fs.unlinkSync(req.file.path);
        await logActividad(req.admin.nombre, 'RESTAURACION_SISTEMA', 'Sistema restaurado desde backup', req);
        res.json({ success: true, stats: { productos: backup.productos?.length||0, ventas: backup.ventas?.length||0, imagenes: backup.metadata?.stats?.imagenes||0 } });
    } catch (error) { console.error('Error restaurando:', error); res.status(500).json({ error: 'Error al restaurar: ' + error.message }); }
});

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Error interno' }); });

async function start() {
    await initDB(); await initConfig(); await initMetodosEnvio(); await initAdmin();
    app.listen(PORT, () => console.log(`\n🏪 ESENCIA CURVY - http://localhost:${PORT}\n📊 Panel Admin: http://localhost:${PORT}/admin\n🛍️ Tienda: http://localhost:${PORT}/tienda\n🌐 Dominio: https://esencia-curvy-production.up.railway.app/tienda\n`));
}
start();
process.on('SIGTERM', () => { pool.end(); process.exit(0); });
process.on('SIGINT', () => { pool.end(); process.exit(0); });

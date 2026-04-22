require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'pos_master_secret_key_2024';
const SESSION_SECRET = process.env.SESSION_SECRET || 'session_secret_2024';
const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Crear directorios necesarios
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads', { recursive: true });
if (!fs.existsSync('./config')) fs.mkdirSync('./config', { recursive: true });
if (!fs.existsSync('./pedidos')) fs.mkdirSync('./pedidos', { recursive: true });
if (!fs.existsSync('./backups')) fs.mkdirSync('./backups', { recursive: true });
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs', { recursive: true });
if (!fs.existsSync('./public')) fs.mkdirSync('./public', { recursive: true });

// Función para inicializar archivos JSON
const initJsonFile = (filePath, defaultContent = { lista: [] }) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
        console.log(`✅ Archivo creado: ${filePath}`);
    } else {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            JSON.parse(content);
        } catch (e) {
            fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
            console.log(`🔄 Archivo reparado: ${filePath}`);
        }
    }
};

// Inicializar archivos de datos
initJsonFile('./productos.json');
initJsonFile('./ventas.json');
initJsonFile('./pedidos.json');
initJsonFile('./categorias.json');
initJsonFile('./metodos-envio.json', { lista: ['Via Cargo', 'Correo Argentino', 'Andreani', 'Moto Mensajería'] });
initJsonFile('./sucursales.json', { lista: [] });
initJsonFile('./usuarios.json', { lista: [] });
initJsonFile('./notificaciones.json', { lista: [] });
initJsonFile('./logs/admin-activity.json', { lista: [] });

// Configuración inicial
if (!fs.existsSync('./config/config.json')) {
    fs.writeFileSync('./config/config.json', JSON.stringify({ 
        logo: null,
        empresa: { nombre: "Blanquería Premium", telefono: "", email: "", direccion: "" },
        horarios: { lunesViernes: "9:00 - 13:00 y 17:00 - 20:00", sabados: "9:00 - 13:00", domingos: "Cerrado" },
        redes: { instagram: "", instagramUrl: "", facebook: "", facebookUrl: "", tiktok: "", tiktokUrl: "", whatsapp: "", whatsappUrl: "" },
        pagos: { alias: "", cbu: "", banco: "", titular: "" },
        mayorista: { habilitado: false, modo: "cantidad", valorCantidad: 3, valorMonto: 80000 },
        tienda: { habilitada: true, titulo: "Blanquería Premium", mensajeBienvenida: "Calidad y confort para tu hogar", retiroLocal: true },
        diseno: { colorPrimario: "#8B5E3C", colorSecundario: "#D4A574", colorFondo: "#FDF8F4", colorTexto: "#3E2A1E" },
        registroObligatorio: true,
        heroConfig: { titulo: "Blanquería de Alta Calidad", subtitulo: "Toallones, sábanas, mantas y más", badge: "¡Precios especiales por cantidad!" },
        seccionesDestacadas: [{ id: "dest-1", titulo: "Novedades", tipo: "categoria", valor: "Toallones", limite: 4 }]
    }, null, 2));
    console.log('✅ Configuración inicial creada');
}

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

// Configuración de email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER || '', pass: process.env.EMAIL_PASS || '' }
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } }));
app.use(passport.initialize());
app.use(passport.session());
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Configuración de Passport
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let usuarios = readData('./usuarios.json');
        let usuario = usuarios.lista.find(u => u.email === profile.emails[0].value);
        if (!usuario) {
            usuario = { id: 'USR-' + Date.now(), nombre: profile.name.givenName || '', apellido: profile.name.familyName || '', email: profile.emails[0].value, googleId: profile.id, foto: profile.photos?.[0]?.value || '', fechaRegistro: new Date().toISOString(), rol: 'cliente' };
            usuarios.lista.push(usuario);
            writeData('./usuarios.json', usuarios);
        }
        return done(null, usuario);
    } catch (e) { return done(e, null); }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    let usuarios = readData('./usuarios.json');
    const user = usuarios.lista.find(u => u.id === id);
    done(null, user || null);
});

// Middleware de logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    });
    next();
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

// Rutas principales
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

// ==================== FUNCIONES AUXILIARES ====================
const readData = (file) => { try { const content = fs.readFileSync(file, 'utf-8'); const data = JSON.parse(content); if (!data.lista) data.lista = []; return data; } catch (e) { return { lista: [] }; } };
const writeData = (file, data) => { try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); return true; } catch (e) { return false; } };
const readConfig = () => { try { return JSON.parse(fs.readFileSync('./config/config.json', 'utf-8')); } catch (e) { return { registroObligatorio: true }; } };
const writeConfig = (data) => { try { fs.writeFileSync('./config/config.json', JSON.stringify(data, null, 2)); return true; } catch (e) { return false; } };
const generarPIN = () => Math.floor(1000 + Math.random() * 9000).toString();

// Funciones de notificación y logs
function crearNotificacion(tipo, titulo, descripcion) {
    const notifData = readData('./notificaciones.json');
    notifData.lista.unshift({ id: 'NOTIF-' + Date.now(), tipo, titulo, descripcion, fecha: new Date().toISOString(), tiempo: 'Ahora mismo', leida: false });
    if (notifData.lista.length > 100) notifData.lista = notifData.lista.slice(0, 100);
    writeData('./notificaciones.json', notifData);
}

function logActividad(admin, accion, detalles, req) {
    const logData = readData('./logs/admin-activity.json');
    logData.lista.unshift({ id: 'LOG-' + Date.now(), admin: admin || 'Sistema', accion, detalles: typeof detalles === 'string' ? detalles : JSON.stringify(detalles).substring(0, 200), ip: req?.ip || req?.connection?.remoteAddress || 'localhost', fecha: new Date().toISOString(), fechaLocal: new Date().toLocaleString('es-AR') });
    if (logData.lista.length > 1000) logData.lista = logData.lista.slice(0, 1000);
    writeData('./logs/admin-activity.json', logData);
}

async function enviarEmail(destinatario, asunto, html) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return false;
    try {
        const config = readConfig();
        await transporter.sendMail({ from: `"${config.empresa.nombre}" <${process.env.EMAIL_USER}>`, to: destinatario, subject: asunto, html });
        console.log(`📧 Email enviado a ${destinatario}`);
        return true;
    } catch (e) { console.error('Error enviando email:', e); return false; }
}

// Plantillas de email
const emailTemplates = {
    pedidoCreado: (pedido, config) => `
        <div style="font-family:Arial;max-width:600px;margin:0 auto;padding:20px;background:#FDF8F4">
            <h1 style="color:#8B5E3C">${config.empresa.nombre}</h1>
            <h2>Pedido #${pedido.id}</h2>
            <p><strong>Total:</strong> ${fmt.format(pedido.total)}</p>
            <p><strong>Estado:</strong> Pendiente de confirmación</p>
            <p>Te avisaremos cuando esté confirmado.</p>
        </div>
    `,
    pedidoConfirmado: (pedido, config) => `
        <div style="font-family:Arial;max-width:600px;margin:0 auto;padding:20px;background:#FDF8F4">
            <h1 style="color:#8B5E3C">${config.empresa.nombre}</h1>
            <h2>¡Pedido confirmado!</h2>
            ${pedido.tipoEntrega === 'local' ? `<div style="background:#F0FDF4;padding:20px;text-align:center"><p>🔐 Tu PIN de retiro</p><div style="font-size:36px;font-weight:800;letter-spacing:12px;color:#8B5E3C">${pedido.pin}</div></div>` : '<p>Tu pedido será enviado pronto.</p>'}
        </div>
    `
};

// Backup automático
const realizarBackupAutomatico = () => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        ['productos.json', 'ventas.json', 'pedidos.json', 'categorias.json', 'usuarios.json', 'config/config.json'].forEach(file => { if (fs.existsSync(file)) fs.copyFileSync(file, path.join('./backups', `${path.basename(file)}.${timestamp}.backup`)); });
        console.log(`✅ Backup: ${timestamp}`);
    } catch (e) {}
};
setInterval(realizarBackupAutomatico, 12 * 60 * 60 * 1000);

// ==================== AUTENTICACIÓN ====================
app.post('/auth/registro', async (req, res) => {
    try {
        const { nombre, apellido, email, telefono, password } = req.body;
        if (!nombre || !apellido || !email || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });
        let usuarios = readData('./usuarios.json');
        if (usuarios.lista.find(u => u.email === email)) return res.status(400).json({ error: 'El email ya está registrado' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const nuevoUsuario = { id: 'USR-' + Date.now(), nombre, apellido, email, telefono: telefono || '', password: hashedPassword, fechaRegistro: new Date().toISOString(), rol: 'cliente' };
        usuarios.lista.push(nuevoUsuario);
        writeData('./usuarios.json', usuarios);
        const token = jwt.sign({ id: nuevoUsuario.id, email, nombre, rol: 'cliente' }, JWT_SECRET, { expiresIn: '7d' });
        logActividad('Sistema', 'REGISTRO', `Nuevo usuario: ${email}`, req);
        res.json({ success: true, token, usuario: { id: nuevoUsuario.id, nombre, apellido, email } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        let usuarios = readData('./usuarios.json');
        const usuario = usuarios.lista.find(u => u.email === email);
        if (!usuario || !usuario.password) return res.status(401).json({ error: 'Credenciales inválidas' });
        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });
        const token = jwt.sign({ id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol }, JWT_SECRET, { expiresIn: '7d' });
        logActividad(usuario.nombre, 'LOGIN', `Inicio de sesión: ${email}`, req);
        res.json({ success: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido, email: usuario.email } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/recuperar', async (req, res) => {
    try {
        const { email } = req.body;
        let usuarios = readData('./usuarios.json');
        const usuario = usuarios.lista.find(u => u.email === email);
        if (!usuario) return res.status(404).json({ error: 'Email no encontrado' });
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        usuario.resetPin = pin;
        usuario.resetPinExpires = Date.now() + 3600000;
        writeData('./usuarios.json', usuarios);
        console.log(`🔐 PIN de recuperación para ${email}: ${pin}`);
        res.json({ success: true, message: 'Se ha enviado un PIN a tu email' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/reset-password', async (req, res) => {
    try {
        const { email, pin, newPassword } = req.body;
        let usuarios = readData('./usuarios.json');
        const usuario = usuarios.lista.find(u => u.email === email);
        if (!usuario || usuario.resetPin !== pin || usuario.resetPinExpires < Date.now()) return res.status(400).json({ error: 'PIN inválido o expirado' });
        usuario.password = await bcrypt.hash(newPassword, 10);
        delete usuario.resetPin; delete usuario.resetPinExpires;
        writeData('./usuarios.json', usuarios);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/auth/me', authMiddleware, (req, res) => {
    let usuarios = readData('./usuarios.json');
    const usuario = usuarios.lista.find(u => u.id === req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido, email: usuario.email, telefono: usuario.telefono, dni: usuario.dni, foto: usuario.foto });
});

app.post('/auth/update-profile', authMiddleware, async (req, res) => {
    try {
        const { nombre, apellido, telefono, dni } = req.body;
        let usuarios = readData('./usuarios.json');
        const usuario = usuarios.lista.find(u => u.id === req.usuario.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        usuario.nombre = nombre || usuario.nombre;
        usuario.apellido = apellido || usuario.apellido;
        usuario.telefono = telefono || usuario.telefono;
        usuario.dni = dni || usuario.dni;
        writeData('./usuarios.json', usuarios);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== MIS PEDIDOS (CLIENTE) ====================
app.get('/api/mis-pedidos', authMiddleware, (req, res) => {
    try {
        let pedidos = readData('./pedidos.json');
        const misPedidos = pedidos.lista.filter(p => p.usuarioId === req.usuario.id || p.cliente?.email === req.usuario.email).sort((a, b) => b.fechaTimestamp - a.fechaTimestamp);
        res.json({ lista: misPedidos });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== RUTAS ADMIN ====================
app.post('/listar', (req, res) => { try { res.json(readData('./productos.json')); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/guardar-producto', (req, res) => {
    try {
        let data = readData('./productos.json');
        const p = req.body;
        if (!p.nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
        if (p.precio <= 0) return res.status(400).json({ error: 'Precio debe ser mayor a 0' });
        if (p.precioMayor > 0 && p.precioMayor >= p.precio) return res.status(400).json({ error: 'Precio mayorista debe ser menor al regular' });
        if (!p.variantes?.length) return res.status(400).json({ error: 'Debe tener al menos una variante' });
        p.precioMayor = p.precioMayor || 0;
        p.variantes = p.variantes.map(v => { if (!v.fotos && v.foto) v.fotos = [v.foto]; if (!v.fotoPrincipal && v.fotos?.length) v.fotoPrincipal = v.fotos[0]; if (!v.foto && v.fotoPrincipal) v.foto = v.fotoPrincipal; return v; });
        const idx = data.lista.findIndex(x => x.id == p.id);
        if (idx !== -1) data.lista[idx] = p; else data.lista.unshift(p);
        writeData('./productos.json', data);
        logActividad('Admin', 'GUARDAR_PRODUCTO', `Producto: ${p.nombre}`, req);
        res.json({ success: true, producto: p });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/subir-imagen', upload.single('foto'), (req, res) => { try { if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' }); res.json({ url: `/uploads/${req.file.filename}` }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/subir-logo', upload.single('logo'), (req, res) => { try { if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' }); const config = readConfig(); if (config.logo && fs.existsSync(path.join(__dirname, config.logo))) fs.unlinkSync(path.join(__dirname, config.logo)); config.logo = `/uploads/${req.file.filename}`; writeConfig(config); res.json({ success: true, url: config.logo }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/get-config', (req, res) => { try { res.json(readConfig()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/save-config', (req, res) => { try { const { empresa, horarios, redes, pagos } = req.body; const config = readConfig(); if (empresa) config.empresa = empresa; if (horarios) config.horarios = horarios; if (redes) config.redes = redes; if (pagos) config.pagos = pagos; writeConfig(config); logActividad('Admin', 'SAVE_CONFIG', 'Configuración guardada', req); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/save-tienda-config', (req, res) => { try { const { tienda } = req.body; const config = readConfig(); config.tienda = { ...config.tienda, ...tienda }; writeConfig(config); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/save-mayorista-config', (req, res) => { try { const { habilitado, modo, valorCantidad, valorMonto } = req.body; const config = readConfig(); config.mayorista = { habilitado, modo, valorCantidad, valorMonto }; writeConfig(config); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/save-diseno-config', (req, res) => { try { const { diseno } = req.body; const config = readConfig(); config.diseno = { ...config.diseno, ...diseno }; writeConfig(config); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/save-home-config', (req, res) => { try { const { heroConfig, seccionesDestacadas } = req.body; const config = readConfig(); config.heroConfig = heroConfig; config.seccionesDestacadas = seccionesDestacadas; writeConfig(config); logActividad('Admin', 'SAVE_HOME_CONFIG', 'Página de inicio actualizada', req); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/eliminar-logo', (req, res) => { try { const config = readConfig(); if (config.logo && fs.existsSync(path.join(__dirname, config.logo))) fs.unlinkSync(path.join(__dirname, config.logo)); config.logo = null; writeConfig(config); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ==================== CATEGORÍAS ====================
app.post('/listar-categorias', (req, res) => { try { res.json(readData('./categorias.json')); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/guardar-categoria', (req, res) => { try { let data = readData('./categorias.json'); const { id, nombre, subcategorias } = req.body; if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' }); const idx = data.lista.findIndex(x => x.id == id); const nueva = { id: id || Date.now(), nombre: nombre.trim(), subcategorias: subcategorias || [] }; if (idx !== -1) data.lista[idx] = nueva; else data.lista.push(nueva); writeData('./categorias.json', data); res.json({ success: true, categoria: nueva }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/eliminar-categoria', (req, res) => { try { let data = readData('./categorias.json'); data.lista = data.lista.filter(x => x.id != req.body.id); writeData('./categorias.json', data); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ==================== MÉTODOS DE ENVÍO ====================
app.post('/listar-metodos-envio', (req, res) => { try { res.json(readData('./metodos-envio.json')); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/guardar-metodos-envio', (req, res) => { try { const { lista } = req.body; writeData('./metodos-envio.json', { lista: lista || [] }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ==================== VENTAS ====================
app.post('/confirmar-venta', (req, res) => {
    try {
        const { carrito, pago, logistica, cliente, mayoristaConfig } = req.body;
        if (!carrito?.length) return res.status(400).json({ error: 'Carrito vacío' });
        let pData = readData('./productos.json');
        let carritoFinal = [...carrito];
        let totalVentaCalculado = pago.total;
        let esMayorista = false, razonMayorista = '';
        if (mayoristaConfig?.habilitado) {
            const { modo, valorCantidad=0, valorMonto=0 } = mayoristaConfig;
            const cantidadTotal = carrito.reduce((s,i) => s+i.cant, 0);
            let totalConMayorista = 0;
            for (let item of carrito) { let precio = item.precio; if (!item.esManual) { const prod = pData.lista.find(x => x.id == item.pId); if (prod?.precioMayor > 0) precio = prod.precioMayor; } totalConMayorista += precio * item.cant; }
            let cumple = false;
            if (modo === 'cantidad') { cumple = cantidadTotal >= valorCantidad; if (!cumple) return res.status(400).json({ error: `Se requieren ${valorCantidad} productos` }); razonMayorista = `Mayorista por cantidad`; }
            else if (modo === 'monto') { cumple = totalConMayorista >= valorMonto; if (!cumple) return res.status(400).json({ error: `Monto mínimo ${fmt.format(valorMonto)}` }); razonMayorista = `Mayorista por monto`; }
            else { const cC = cantidadTotal >= valorCantidad, cM = totalConMayorista >= valorMonto; cumple = cC && cM; if (!cumple) return res.status(400).json({ error: `Debe cumplir cantidad y monto` }); razonMayorista = `Mayorista por cantidad y monto`; }
            esMayorista = true; carritoFinal = []; totalVentaCalculado = 0;
            for (let item of carrito) { let precio = item.precio; if (!item.esManual) { const prod = pData.lista.find(x => x.id == item.pId); if (prod?.precioMayor > 0) precio = prod.precioMayor; } carritoFinal.push({ ...item, precio, precioOriginal: item.precio, aplicaMayorista: precio !== item.precio }); totalVentaCalculado += precio * item.cant; }
        }
        for (let item of carritoFinal) { if (item.esManual) continue; const prod = pData.lista.find(x => x.id == item.pId); if (!prod) return res.status(400).json({ error: `Producto no encontrado` }); const variante = prod.variantes.find(v => v.nombre === item.vNom); if (!variante || variante.stock < item.cant) return res.status(400).json({ error: `Stock insuficiente para ${item.pNom} - ${item.vNom}. Disponible: ${variante.stock || 0}` }); }
        for (let item of carritoFinal) { if (!item.esManual) { const prod = pData.lista.find(x => x.id == item.pId); prod.variantes.find(v => v.nombre === item.vNom).stock -= item.cant; } }
        writeData('./productos.json', pData);
        let vData = readData('./ventas.json');
        const nuevaVenta = { id: 'FAC-' + Date.now(), fecha: new Date().toLocaleString('es-AR'), fechaTimestamp: Date.now(), items: carritoFinal.map(i => ({ ...i, subtotal: i.precio*i.cant })), pago: { ...pago, total: totalVentaCalculado }, logistica, cliente: cliente || { nombre: 'Mostrador' }, esMayorista, razonMayorista, estado: 'completada' };
        vData.lista.unshift(nuevaVenta);
        writeData('./ventas.json', vData);
        logActividad('Admin', 'VENTA', `Venta ${nuevaVenta.id} - ${fmt.format(totalVentaCalculado)}`, req);
        res.json({ success: true, ventaId: nuevaVenta.id, esMayorista, razonMayorista });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/listar-ventas', (req, res) => { try { res.json(readData('./ventas.json')); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/corte-caja', (req, res) => { try { const ventas = readData('./ventas.json').lista; const hoy = new Date().toLocaleDateString('es-AR'); const ventasHoy = ventas.filter(v => new Date(v.fechaTimestamp).toLocaleDateString('es-AR') === hoy); res.json({ fecha: hoy, total: ventasHoy.reduce((s,v)=>s+v.pago.total,0), cantidad: ventasHoy.length, porMetodo: { efectivo: ventasHoy.filter(v=>v.pago.metodo==='efectivo').reduce((s,v)=>s+v.pago.total,0), transferencia: ventasHoy.filter(v=>v.pago.metodo==='transferencia').reduce((s,v)=>s+v.pago.total,0), mixto: ventasHoy.filter(v=>v.pago.metodo==='mixto').reduce((s,v)=>s+v.pago.total,0), pedido_online: ventasHoy.filter(v=>v.pago.metodo==='pedido_online').reduce((s,v)=>s+v.pago.total,0) } }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/reordenar-productos', (req, res) => { try { writeData('./productos.json', req.body); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/eliminar-producto', (req, res) => { try { let data = readData('./productos.json'); const prod = data.lista.find(x => x.id == req.body.id); data.lista = data.lista.filter(x => x.id != req.body.id); writeData('./productos.json', data); if (prod?.variantes) prod.variantes.forEach(v => { if (v.foto && fs.existsSync(path.join(__dirname, v.foto))) fs.unlinkSync(path.join(__dirname, v.foto)); }); logActividad('Admin', 'ELIMINAR_PRODUCTO', `Producto: ${prod?.nombre}`, req); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/stock-bajo', (req, res) => { try { const { minimo=5 } = req.body; const data = readData('./productos.json'); const bajo = data.lista.filter(p=>p.variantes.some(v=>v.stock<=minimo)).map(p=>({ id:p.id, nombre:p.nombre, variantes:p.variantes.filter(v=>v.stock<=minimo).map(v=>({ nombre:v.nombre, stock:v.stock })) })); res.json({ stockBajo: bajo }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ==================== TIENDA ====================
app.post('/tienda/listar-productos', (req, res) => {
    try {
        const data = readData('./productos.json');
        const categorias = readData('./categorias.json');
        const metodosEnvio = readData('./metodos-envio.json');
        const config = readConfig();
        if (!config.tienda?.habilitada) return res.status(403).json({ error: 'Tienda cerrada' });
        res.json({ productos: data.lista, categorias: categorias.lista, metodosEnvio: metodosEnvio.lista, configuracion: { empresa: config.empresa, logo: config.logo, tienda: config.tienda, mayorista: config.mayorista, horarios: config.horarios, redes: config.redes, pagos: config.pagos, diseno: config.diseno, registroObligatorio: config.registroObligatorio, heroConfig: config.heroConfig, seccionesDestacadas: config.seccionesDestacadas } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CREAR PEDIDO - CON AUTENTICACIÓN OBLIGATORIA ====================
app.post('/tienda/crear-pedido', authMiddleware, (req, res) => {
    try {
        const { carrito, cliente, total, esMayorista, razonMayorista, tipoEntrega, metodoEnvio } = req.body;
        if (!carrito?.length) return res.status(400).json({ error: 'Carrito vacío' });
        
        let usuarios = readData('./usuarios.json');
        const usuario = usuarios.lista.find(u => u.id === req.usuario.id);
        if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado' });
        
        // FORZAR datos del cliente desde el perfil
        cliente.nombre = usuario.nombre;
        cliente.apellido = usuario.apellido;
        cliente.email = usuario.email;
        if (!cliente.dni) cliente.dni = usuario.dni || '';
        if (!cliente.telefono) cliente.telefono = usuario.telefono || '';
        
        let pData = readData('./productos.json');
        for (let item of carrito) { 
            if (item.esManual) continue; 
            const prod = pData.lista.find(x => x.id == item.pId); 
            if (!prod) return res.status(400).json({ error: `Producto no encontrado` }); 
            const v = prod.variantes.find(v => v.nombre === item.vNom); 
            if (!v) return res.status(400).json({ error: `Variante no encontrada` });
            if (v.stock < item.cant) return res.status(400).json({ error: `Stock insuficiente para ${item.pNom} - ${item.vNom}. Disponible: ${v.stock}` }); 
            v.stock -= item.cant;
        }
        writeData('./productos.json', pData);
        
        const pedidosData = readData('./pedidos.json');
        const nuevo = { 
            id: 'PED-' + Date.now(), fecha: new Date().toLocaleString('es-AR'), fechaTimestamp: Date.now(), 
            items: carrito.map(i => ({...i, subtotal: i.precio * i.cant})), total, 
            cliente: { nombre: cliente.nombre, apellido: cliente.apellido, dni: cliente.dni || '', email: cliente.email, telefono: cliente.telefono || '', provincia: cliente.provincia || '', localidad: cliente.localidad || '', cp: cliente.cp || '', direccion: cliente.direccion || '', altura: cliente.altura || '', referencias: cliente.referencias || '', notas: cliente.notas || '' }, 
            tipoEntrega: tipoEntrega || 'local', metodoEnvio: metodoEnvio || '', esMayorista: esMayorista || false, razonMayorista: razonMayorista || '', 
            estado: 'pendiente', origen: 'tienda', pin: null, stockDescontado: true, usuarioId: usuario.id
        };
        pedidosData.lista.unshift(nuevo);
        writeData('./pedidos.json', pedidosData);
        
        crearNotificacion('pedido', '🛍️ Nuevo pedido web', `Pedido #${nuevo.id} - ${cliente.nombre} ${cliente.apellido} - ${fmt.format(total)}`);
        logActividad(cliente.nombre, 'PEDIDO_WEB', `Pedido ${nuevo.id} - ${cliente.email}`, req);
        
        const config = readConfig();
        if (cliente.email) enviarEmail(cliente.email, `Pedido #${nuevo.id} recibido - ${config.empresa.nombre}`, emailTemplates.pedidoCreado(nuevo, config));
        res.json({ success: true, pedidoId: nuevo.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tienda/listar-pedidos', (req, res) => { try { res.json(readData('./pedidos.json')); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/tienda/confirmar-pedido', (req, res) => {
    try {
        const { pedidoId } = req.body;
        let pedidosData = readData('./pedidos.json'), pData = readData('./productos.json');
        const pedido = pedidosData.lista.find(p => p.id === pedidoId);
        if (!pedido || pedido.estado !== 'pendiente') return res.status(400).json({ error: 'Pedido no válido' });
        const pin = generarPIN();
        for (let item of pedido.items) { if (item.esManual) continue; const prod = pData.lista.find(x => x.id == item.pId); const v = prod.variantes.find(v => v.nombre === item.vNom); if (!v) return res.status(400).json({ error: `Variante no encontrada` }); if (v.stock < 0) return res.status(400).json({ error: `Stock inconsistente` }); }
        let ventasData = readData('./ventas.json');
        const nuevaVenta = { id: 'FAC-' + Date.now(), fecha: new Date().toLocaleString('es-AR'), fechaTimestamp: Date.now(), items: pedido.items, pago: { total: pedido.total, metodo: 'pedido_online' }, logistica: pedido.tipoEntrega === 'envio' ? 'envio' : 'local', cliente: pedido.cliente, esMayorista: pedido.esMayorista, estado: 'completada', origen: 'tienda', pedidoId: pedido.id };
        ventasData.lista.unshift(nuevaVenta);
        pedido.estado = 'confirmado'; pedido.ventaId = nuevaVenta.id; pedido.pin = pin; pedido.pinGenerado = new Date().toISOString();
        writeData('./ventas.json', ventasData); writeData('./pedidos.json', pedidosData);
        logActividad('Admin', 'CONFIRMAR_PEDIDO', `Pedido ${pedido.id} confirmado - PIN: ${pin}`, req);
        console.log(`🔐 PIN: ${pin} - Pedido: ${pedido.id}`);
        const config = readConfig();
        if (pedido.cliente?.email) enviarEmail(pedido.cliente.email, `Pedido #${pedido.id} confirmado - ${config.empresa.nombre}`, emailTemplates.pedidoConfirmado(pedido, config));
        res.json({ success: true, ventaId: nuevaVenta.id, pin });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tienda/cancelar-pedido', authMiddleware, (req, res) => {
    try { 
        let pedidosData = readData('./pedidos.json'), pData = readData('./productos.json');
        const pedido = pedidosData.lista.find(p => p.id === req.body.pedidoId && p.usuarioId === req.usuario.id); 
        if (!pedido || pedido.estado !== 'pendiente') return res.status(400).json({ error: 'No se puede cancelar' }); 
        for (let item of pedido.items) { if (item.esManual) continue; const prod = pData.lista.find(x => x.id == item.pId); if (prod) { const v = prod.variantes.find(v => v.nombre === item.vNom); if (v) v.stock += item.cant; } }
        pedido.estado = 'cancelado'; pedido.fechaCancelado = new Date().toISOString();
        writeData('./productos.json', pData); writeData('./pedidos.json', pedidosData); 
        logActividad(req.usuario.nombre, 'CANCELAR_PEDIDO', `Pedido ${pedido.id} cancelado`, req);
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== GESTIÓN DE PEDIDOS WEB (ADMIN) ====================
app.post('/tienda/marcar-abonado', (req, res) => { try { let pedidosData = readData('./pedidos.json'); const pedido = pedidosData.lista.find(p=>p.id===req.body.pedidoId); if (!pedido) return res.status(400).json({ error: 'Pedido no encontrado' }); if (pedido.estado==='cancelado') return res.status(400).json({ error: 'Pedido cancelado' }); pedido.estado = 'abonado'; pedido.fechaAbonado = new Date().toISOString(); writeData('./pedidos.json', pedidosData); logActividad('Admin', 'MARCAR_ABONADO', `Pedido ${pedido.id} abonado`, req); res.json({ success: true, pedido }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/tienda/marcar-enviado', (req, res) => { try { let pedidosData = readData('./pedidos.json'); const pedido = pedidosData.lista.find(p=>p.id===req.body.pedidoId); if (!pedido) return res.status(400).json({ error: 'Pedido no encontrado' }); if (pedido.estado!=='abonado' && pedido.estado!=='confirmado') return res.status(400).json({ error: 'Debe estar abonado o confirmado' }); pedido.estado = 'enviado'; pedido.fechaEnviado = new Date().toISOString(); writeData('./pedidos.json', pedidosData); logActividad('Admin', 'MARCAR_ENVIADO', `Pedido ${pedido.id} enviado`, req); res.json({ success: true, pedido }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/tienda/marcar-entregado', (req, res) => { try { let pedidosData = readData('./pedidos.json'); const pedido = pedidosData.lista.find(p => p.id === req.body.pedidoId); if (!pedido) return res.status(400).json({ error: 'Pedido no encontrado' }); if (pedido.estado !== 'abonado' && pedido.estado !== 'confirmado') return res.status(400).json({ error: 'El pedido debe estar abonado o confirmado' }); pedido.estado = 'entregado'; pedido.fechaEntregado = new Date().toISOString(); writeData('./pedidos.json', pedidosData); logActividad('Admin', 'MARCAR_ENTREGADO', `Pedido ${pedido.id} entregado`, req); res.json({ success: true, pedido }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/tienda/cancelar-pedido-admin', (req, res) => { try { let pedidosData = readData('./pedidos.json'), pData = readData('./productos.json'); const pedido = pedidosData.lista.find(p=>p.id===req.body.pedidoId); if (!pedido) return res.status(400).json({ error: 'Pedido no encontrado' }); if (pedido.estado==='entregado') return res.status(400).json({ error: 'No se puede cancelar entregado' }); if (pedido.estado==='cancelado') return res.status(400).json({ error: 'Ya está cancelado' }); if (pedido.estado==='confirmado' || pedido.estado==='abonado' || pedido.estado==='enviado') { for (let item of pedido.items) { if (item.esManual) continue; const prod = pData.lista.find(x=>x.id==item.pId); if (prod) { const v = prod.variantes.find(v=>v.nombre===item.vNom); if (v) v.stock += item.cant; } } writeData('./productos.json', pData); } pedido.estado = 'cancelado'; pedido.fechaCancelado = new Date().toISOString(); writeData('./pedidos.json', pedidosData); logActividad('Admin', 'CANCELAR_PEDIDO', `Pedido ${pedido.id} cancelado - Stock devuelto`, req); res.json({ success: true, pedido }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ==================== RETIRAR CON PIN ====================
app.post('/tienda/retirar-pedido', (req, res) => { try { let pedidosData = readData('./pedidos.json'); const pedido = pedidosData.lista.find(p => p.id === req.body.pedidoId); if (!pedido || (pedido.estado !== 'confirmado' && pedido.estado !== 'abonado') || pedido.pin !== req.body.pin) return res.status(400).json({ error: 'PIN incorrecto o pedido no válido' }); pedido.estado = 'entregado'; pedido.fechaEntrega = new Date().toISOString(); writeData('./pedidos.json', pedidosData); logActividad('Admin', 'RETIRAR_PEDIDO', `Pedido ${pedido.id} retirado con PIN`, req); res.json({ success: true, pedido }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/tienda/verificar-pin', (req, res) => { try { let pedidosData = readData('./pedidos.json'); const pedido = pedidosData.lista.find(p => p.pin === req.body.pin && (p.estado === 'confirmado' || p.estado === 'abonado')); if (!pedido) return res.status(400).json({ error: 'PIN no encontrado o pedido no está listo' }); res.json({ success: true, pedido }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ==================== DASHBOARD ====================
app.post('/dashboard/stats', (req, res) => {
    try {
        const ventas = readData('./ventas.json').lista;
        const usuarios = readData('./usuarios.json').lista;
        const hoy = new Date().toLocaleDateString('es-AR');
        const ventasHoy = ventas.filter(v => new Date(v.fechaTimestamp).toLocaleDateString('es-AR') === hoy);
        const totalHoy = ventasHoy.reduce((s, v) => s + v.pago.total, 0);
        const ticketPromedio = ventasHoy.length ? totalHoy / ventasHoy.length : 0;
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
        const clientesNuevos = usuarios.filter(u => new Date(u.fechaRegistro) >= inicioMes).length;
        const ventasSemana = []; for (let i = 6; i >= 0; i--) { const fecha = new Date(); fecha.setDate(fecha.getDate() - i); const fechaStr = fecha.toLocaleDateString('es-AR'); const ventasDia = ventas.filter(v => new Date(v.fechaTimestamp).toLocaleDateString('es-AR') === fechaStr); ventasSemana.push({ dia: fecha.toLocaleDateString('es-AR', { weekday: 'short' }), total: ventasDia.reduce((s, v) => s + v.pago.total, 0) }); }
        const productosVendidos = {}; ventas.forEach(v => { v.items.forEach(i => { if (!productosVendidos[i.pNom]) productosVendidos[i.pNom] = 0; productosVendidos[i.pNom] += i.cant; }); });
        const productosTop = Object.entries(productosVendidos).map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
        const clientesCompras = {}; ventas.forEach(v => { const nombre = v.cliente?.nombre || 'Mostrador'; if (!clientesCompras[nombre]) clientesCompras[nombre] = { compras: 0, total: 0 }; clientesCompras[nombre].compras++; clientesCompras[nombre].total += v.pago.total; });
        const clientesTop = Object.entries(clientesCompras).map(([nombre, data]) => ({ nombre, ...data })).sort((a, b) => b.compras - a.compras).slice(0, 5);
        const horarios = {}; for (let i = 8; i <= 20; i++) horarios[i] = 0; ventas.forEach(v => { const hora = new Date(v.fechaTimestamp).getHours(); if (horarios[hora] !== undefined) horarios[hora]++; });
        const horariosPico = Object.entries(horarios).map(([hora, cantidad]) => ({ hora: parseInt(hora), cantidad })).sort((a, b) => b.cantidad - a.cantidad).slice(0, 8).sort((a, b) => a.hora - b.hora);
        res.json({ ventasHoy: ventasHoy.length, totalHoy, ticketPromedio, clientesNuevos, ventasSemana, productosTop, clientesTop, horariosPico });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== NOTIFICACIONES Y LOGS ====================
app.post('/notificaciones', (req, res) => { try { res.json(readData('./notificaciones.json')); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/notificaciones/leer', (req, res) => { try { let data = readData('./notificaciones.json'); const notif = data.lista.find(n => n.id === req.body.id); if (notif) notif.leida = true; writeData('./notificaciones.json', data); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/notificaciones/leer-todas', (req, res) => { try { let data = readData('./notificaciones.json'); data.lista.forEach(n => n.leida = true); writeData('./notificaciones.json', data); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/logs/admin', (req, res) => { try { res.json(readData('./logs/admin-activity.json')); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/backup', (req, res) => { try { realizarBackupAutomatico(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// Manejo de errores
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Error interno' }); });

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║              🏪 POS MASTER - SISTEMA ACTIVO                  ║`);
    console.log(`╠══════════════════════════════════════════════════════════════╣`);
    console.log(`║  📊 Panel: http://localhost:${PORT}/admin                      ║`);
    console.log(`║  🛒 Tienda: http://localhost:${PORT}/tienda                    ║`);
    console.log(`║  📝 Checkout: http://localhost:${PORT}/checkout                ║`);
    console.log(`║  🔐 Login: http://localhost:${PORT}/login                      ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
    setTimeout(realizarBackupAutomatico, 5000);
});

process.on('SIGTERM', () => { realizarBackupAutomatico(); process.exit(0); });
process.on('SIGINT', () => { realizarBackupAutomatico(); process.exit(0); });
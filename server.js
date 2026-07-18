require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { connectDB, collection, dbGet, dbAll } = require('./database');

const app = express();

const OWNER = '@sahilxalone';
const CHANNEL = '@OSINTNXERA';

const MASTER_KEYS = {
    ftosint: 'sahil-new',
    mistral: 'FVKec5Xqa2ORzSoBrqi21nRbIM6rFk2q'
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(cors());

app.use(session({
    secret: 'osint_secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => req.query.key || req.ip,
    handler: (req, res) => res.json({ error: 'Rate limit exceeded', contact: OWNER })
});

function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

function requireHeadAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'head_admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
}

// ============ API PROXY MAP ============
const apiProxyMap = {
    'vehicle-info': (p) => `http://172.104.161.81:7790/api/vehicle/${p.vehicle || p.q || p.term}`,
    'telegram-num': (p) => `https://tg-to-num-501x.onrender.com/api/tg?key=permanant&info=${p.term || p.id || p.username}`,
    'family-info': (p) => `https://osint.invalidayushh.workers.dev/adhar?key=Sahil&q=${p.q || p.term || p.id}`,
    'number-info': (p) => `https://osint.invalidayushh.workers.dev/num?key=Sahil&q=${p.q || p.number || p.num}`,
    'aadhar-info': (p) => `https://osint.invalidayushh.workers.dev/adhar?key=Sahil&q=${p.q || p.num || p.aadhar}`,
    'num-newinfo': (p) => `https://ft-osint-api.duckdns.org/api/number?key=${MASTER_KEYS.ftosint}&num=${p.q || p.number || p.num}`,
    'email-info': (p) => `https://osint.invalidayushh.workers.dev/email?key=Sahil&q=${p.q || p.email}`,
    'insta': (p) => `https://osint.invalidayushh.workers.dev/insta?key=Sahil&q=${p.username}`,
    'vehicle': (p) => `https://osint.invalidayushh.workers.dev/veh?key=Sahil&q=${p.vehicle}`,
    'family': (p) => `https://ayaanmods.site/family.php?key=${MASTER_KEYS.subhxco}&term=${p.term}`,
    'num-india': (p) => `https://ft-osint-api.duckdns.org/api/number?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'num-pak': (p) => `https://ft-osint-api.duckdns.org/api/pk?key=${MASTER_KEYS.ftosint}&number=${p.number}`,
    'name-details': (p) => `https://ft-osint-api.duckdns.org/api/name?key=${MASTER_KEYS.ftosint}&name=${p.name}`,
    'bank': (p) => `https://ft-osint-api.duckdns.org/api/ifsc?key=${MASTER_KEYS.ftosint}&ifsc=${p.ifsc}`,
    'pan': (p) => `https://ft-osint-api.duckdns.org/api/pan?key=${MASTER_KEYS.ftosint}&pan=${p.pan}`,
    'rc': (p) => `https://ft-osint-api.duckdns.org/api/rc?key=${MASTER_KEYS.ftosint}&owner=${p.owner}`,
    'ip': (p) => `https://ft-osint-api.duckdns.org/api/ip?key=${MASTER_KEYS.ftosint}&ip=${p.ip}`,
    'pincode': (p) => `https://ft-osint-api.duckdns.org/api/pincode?key=${MASTER_KEYS.ftosint}&pin=${p.pin}`,
    'git': (p) => `https://ft-osint-api.duckdns.org/api/git?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'bgmi': (p) => `https://ft-osint-api.duckdns.org/api/bgmi?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ff': (p) => `https://ft-osint-api.duckdns.org/api/ff?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'aadhar': (p) => `https://ft-osint-api.duckdns.org/api/aadhar?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'ai-image': (p) => `https://ayaanmods.site/aiimage.php?key=${MASTER_KEYS.ayaanmods}&prompt=${p.prompt}`,
    'num-fullinfo': (p) => `https://say-wallahai-bro-say-wallahi.onrender.com/raavan/v34/query=${p.number}/key=${MASTER_KEYS.truecallerLeak}`,
    'mistral': `mistral-direct`,
    'veh-to-num': (p) => `https://vehicleinfo.noobgamingv40.workers.dev/fetch?vehicle=${p.vehicle || p.term}`
};

// ============ CLEAN FUNCTION ============
function cleanResponseData(data) {
    if (!data || typeof data !== 'object') return data;
    let cleaned = JSON.parse(JSON.stringify(data));
    
    const removeFields = [
        'owner', 'OWNER', 'channel', 'CHANNEL', 'telegram', 'contact', 
        'instagram', 'twitter', 'fb', 'facebook', 'website', 'github', 
        'created_by', 'createdBy', 'owner_username', 'owner_channel',
        'credit', 'Credits', 'Credit', 'Source', 'source', 'provider', 
        'Provider', 'api_source', 'API_Source', 'developer', 'Developer', 
        'dev', 'Dev', 'invalidayushh', 'ftgamerv2', 'ftgamer2', 
        '@invalidayushh', '@ftgamerv2', '@ftgamer2', 'InvalidAyush', 
        '@InvalidAyush', 'invalidayush', '@invalidayush',
        'DM TO BUY ACCESS', 'xtradeep', 'Kon_Hu_Mai', 'support', 'Support'
    ];
    
    function cleanObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (let key in obj) {
            if (removeFields.includes(key) || removeFields.includes(key.toLowerCase())) {
                delete obj[key];
            } else if (typeof obj[key] === 'string') {
                if (obj[key].includes('InvalidAyush') || obj[key].includes('@InvalidAyush') ||
                    obj[key].includes('invalidayush') || obj[key].includes('ftgamerv2') || 
                    obj[key].includes('ftgamer2') || obj[key].includes('@ftgamerv2') || 
                    obj[key].includes('@ftgamer2')) {
                    delete obj[key];
                }
            } else if (typeof obj[key] === 'object') {
                cleanObject(obj[key]);
            }
        }
    }
    cleanObject(cleaned);
    cleaned.owner = OWNER;
    cleaned.channel = CHANNEL;
    return cleaned;
}

// ============ ROUTES ============

// Connect to MongoDB before starting
let db;
(async () => {
    db = await connectDB();
})();

app.get('/', async (req, res) => {
    try {
        const apis = await db.collection('available_apis').find({}).toArray();
        const keys = await db.collection('api_keys').find({}).toArray();
        
        // Calculate total hits
        let totalHits = 0;
        keys.forEach(k => totalHits += (k.hits || 0));
        
        res.render('index', { 
            user: req.session.user || null,
            totalApis: apis.length,
            totalKeys: keys.length,
            totalHits: totalHits,
            owner: OWNER,
            channel: CHANNEL
        });
    } catch (error) {
        res.render('index', { 
            user: req.session.user || null,
            totalApis: 0,
            totalKeys: 0,
            totalHits: 0,
            owner: OWNER,
            channel: CHANNEL
        });
    }
});

app.get('/endpoints', async (req, res) => {
    try {
        const apis = await db.collection('available_apis')
            .find({ is_active: 1 })
            .toArray();
        
        const formattedApis = apis.map(api => {
            let params = {};
            try { 
                params = JSON.parse(api.required_params || '{}'); 
            } catch(e) { 
                params = {}; 
            }
            const paramName = Object.keys(params)[0] || 'param';
            return { 
                ...api, 
                param_name: paramName, 
                param_example: params[paramName] || 'value',
                full_url: api.endpoint
            };
        });
        
        res.render('endpoints', { 
            apis: formattedApis, 
            baseUrl: req.protocol + '://' + req.get('host'),
            owner: OWNER,
            channel: CHANNEL,
            user: req.session.user || null
        });
    } catch (error) {
        res.status(500).send('Error loading endpoints');
    }
});

app.get('/docs', async (req, res) => {
    try {
        const apis = await db.collection('available_apis')
            .find({ is_active: 1 })
            .toArray();
        
        const formattedApis = apis.map(api => {
            let params = {};
            try { 
                params = JSON.parse(api.required_params || '{}'); 
            } catch(e) { 
                params = {}; 
            }
            const paramName = Object.keys(params)[0] || 'param';
            return { ...api, param_name: paramName, param_example: params[paramName] || 'value' };
        });
        
        res.render('docs', { 
            apis: formattedApis, 
            baseUrl: req.protocol + '://' + req.get('host'),
            owner: OWNER,
            channel: CHANNEL,
            user: req.session.user || null
        });
    } catch (error) {
        res.status(500).send('Error loading docs');
    }
});

app.get('/login', (req, res) => { 
    res.render('login', { error: req.query.error || null }); 
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.redirect('/login?error=missing');
    
    try {
        const user = await db.collection('users').findOne({ username: username });
        if (!user) return res.redirect('/login?error=invalid');
        
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.user = { id: user._id, username: user.username, role: user.role };
            return res.redirect(user.role === 'head_admin' ? '/head-admin/dashboard' : '/admin/dashboard');
        }
        return res.redirect('/login?error=invalid');
    } catch (error) {
        return res.redirect('/login?error=server');
    }
});

app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/'); 
});

app.get('/head-admin/dashboard', requireHeadAdmin, async (req, res) => {
    try {
        const users = await db.collection('users')
            .find({ role: { $ne: 'head_admin' } })
            .toArray();
        
        const keys = await db.collection('api_keys')
            .find({})
            .sort({ created_at: -1 })
            .toArray();
        
        // Calculate total hits
        let totalHits = 0;
        keys.forEach(k => totalHits += (k.hits || 0));
        
        res.render('head_admin_dashboard', {
            user: req.session.user,
            admins: users || [],
            keys: keys || [],
            totalHits: totalHits,
            popular: [],
            topUsers: [],
            todayCalls: {},
            owner: OWNER,
            channel: CHANNEL
        });
    } catch (error) {
        res.status(500).send('Error loading dashboard');
    }
});

app.get('/admin/dashboard', requireAuth, async (req, res) => {
    if (req.session.user.role === 'head_admin') {
        return res.redirect('/head-admin/dashboard');
    }
    
    try {
        const keys = await db.collection('api_keys')
            .find({})
            .sort({ created_at: -1 })
            .toArray();
        
        const apis = await db.collection('available_apis')
            .find({ is_active: 1 })
            .toArray();
        
        // Calculate stats
        let totalHits = 0;
        let activeKeys = 0;
        keys.forEach(k => {
            totalHits += (k.hits || 0);
            if (k.status === 'active') activeKeys++;
        });
        
        const formattedApis = apis.map(api => {
            let params = {};
            try { 
                params = JSON.parse(api.required_params || '{}'); 
            } catch(e) { 
                params = {}; 
            }
            const paramName = Object.keys(params)[0] || 'param';
            return { ...api, param_name: paramName, param_example: params[paramName] || 'value' };
        });
        
        res.render('dashboard', {
            keys: keys || [],
            totalHits: totalHits,
            active: activeKeys,
            apis: formattedApis,
            popular: [],
            topUsers: [],
            todayCalls: {},
            user: req.session.user,
            baseUrl: req.protocol + '://' + req.get('host'),
            owner: OWNER,
            channel: CHANNEL
        });
    } catch (error) {
        res.status(500).send('Error loading dashboard');
    }
});

// ============ GENERATE KEY ============
app.post('/admin/generate-key', requireAuth, async (req, res) => {
    const { name, expiry, unlimited_hits, allowed_apis, custom_key, 
            rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute } = req.body;
    
    const isCustomEnabled = req.body.enable_custom === 'on' || req.body.enable_custom === true;
    
    if (isCustomEnabled && (!custom_key || custom_key.trim() === '')) {
        return res.status(400).send('❌ Please enter a custom key or disable custom key option');
    }
    
    function createKey(apiKey, isCustom) {
        let expires_at = null;
        const now = new Date();
        if (expiry === '7d') expires_at = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
        else if (expiry === '15d') expires_at = new Date(now.getTime() + (15 * 24 * 60 * 60 * 1000));
        else if (expiry === '1m') expires_at = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        else if (expiry === '1y') expires_at = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000));
        
        let allowedApisJson = '["all"]';
        if (allowed_apis) {
            if (Array.isArray(allowed_apis)) {
                allowedApisJson = JSON.stringify(allowed_apis);
            } else if (typeof allowed_apis === 'string') {
                if (allowed_apis === 'all') {
                    allowedApisJson = '["all"]';
                } else {
                    const apiArray = allowed_apis.split(',').map(api => api.trim()).filter(api => api);
                    allowedApisJson = JSON.stringify(apiArray);
                }
            }
        }
        
        const isUnlimited = unlimited_hits === 'true' || unlimited_hits === 'on';
        const rateLimitEnabled = isUnlimited ? 0 : (rate_limit_enabled === 'on' || rate_limit_enabled === 'true' ? 1 : 0);
        
        db.collection('api_keys').insertOne({
            key: apiKey,
            name: name,
            owner_username: OWNER,
            owner_channel: CHANNEL,
            expires_at: expires_at,
            unlimited_hits: isUnlimited ? 1 : 0,
            allowed_apis: allowedApisJson,
            is_custom: isCustom ? 1 : 0,
            status: 'active',
            hits: 0,
            rate_limit_enabled: rateLimitEnabled,
            rate_limit_per_day: isUnlimited ? 0 : (parseInt(rate_limit_per_day) || 100),
            rate_limit_per_hour: isUnlimited ? 0 : (parseInt(rate_limit_per_hour) || 20),
            rate_limit_per_minute: isUnlimited ? 0 : (parseInt(rate_limit_per_minute) || 5),
            created_at: new Date()
        }).then(() => {
            console.log('✅ Key created successfully:', apiKey);
            res.redirect('/admin/dashboard');
        }).catch(err => {
            console.error('❌ DB Error:', err.message);
            res.status(500).send('Database error: ' + err.message);
        });
    }
    
    if (isCustomEnabled && custom_key && custom_key.trim() !== '') {
        let apiKey = custom_key.trim().toUpperCase();
        apiKey = apiKey.replace(/[^A-Z0-9_]/g, '');
        
        if (apiKey.length < 3) {
            return res.status(400).send('❌ Custom key must be at least 3 characters');
        }
        
        const existing = await db.collection('api_keys').findOne({ key: apiKey });
        if (existing) {
            return res.status(400).send('❌ Key already exists: ' + apiKey);
        }
        createKey(apiKey, true);
    } else {
        let apiKey = 'OSINT_' + Math.random().toString(36).substring(2, 18).toUpperCase();
        createKey(apiKey, false);
    }
});

app.post('/admin/delete-key', requireAuth, async (req, res) => {
    await db.collection('api_keys').deleteOne({ _id: new require('mongodb').ObjectId(req.body.id) });
    res.redirect('/admin/dashboard');
});

app.post('/admin/toggle-status', requireAuth, async (req, res) => {
    const { id, status } = req.body;
    const newStatus = status === 'active' ? 'disabled' : 'active';
    await db.collection('api_keys').updateOne(
        { _id: new require('mongodb').ObjectId(id) },
        { $set: { status: newStatus } }
    );
    res.redirect('/admin/dashboard');
});

app.post('/head-admin/update-rate-limit', requireHeadAdmin, async (req, res) => {
    const { key_id, unlimited_hits, rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute } = req.body;
    const isUnlimited = unlimited_hits === 'true';
    
    await db.collection('api_keys').updateOne(
        { _id: new require('mongodb').ObjectId(key_id) },
        { 
            $set: { 
                unlimited_hits: isUnlimited ? 1 : 0,
                rate_limit_enabled: isUnlimited ? 0 : (rate_limit_enabled === 'true' ? 1 : 0),
                rate_limit_per_day: parseInt(rate_limit_per_day) || 100,
                rate_limit_per_hour: parseInt(rate_limit_per_hour) || 20,
                rate_limit_per_minute: parseInt(rate_limit_per_minute) || 5
            }
        }
    );
    res.json({ success: true });
});

app.post('/head-admin/create-admin', requireHeadAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.json({ error: 'Username and password required' });
    
    const existing = await db.collection('users').findOne({ username: username });
    if (existing) return res.json({ error: 'Username already exists' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
        username: username,
        password: hashedPassword,
        role: role || 'admin',
        created_by: req.session.user.username,
        created_at: new Date()
    });
    res.json({ success: true });
});

app.post('/head-admin/remove-admin', requireHeadAdmin, async (req, res) => {
    await db.collection('users').deleteOne({ 
        _id: new require('mongodb').ObjectId(req.body.admin_id),
        role: { $ne: 'head_admin' }
    });
    res.json({ success: true });
});

// ============ MISTRAL AI ============
async function handleMistralAI(message) {
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: 'mistral-medium-latest',
            messages: [{ role: "user", content: message }]
        }, { 
            headers: { 
                'Authorization': `Bearer ${MASTER_KEYS.mistral}`, 
                'Content-Type': 'application/json' 
            }, 
            timeout: 30000 
        });
        return { success: true, response: response.data.choices[0].message.content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============ API ENDPOINTS ============
app.all('/api/:endpoint', globalLimiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    const endpoint = req.params.endpoint;
    
    if (!userKey) return res.json({ error: 'API key required', contact: OWNER });
    
    try {
        const keyData = await db.collection('api_keys').findOne({ 
            key: userKey, 
            status: 'active' 
        });
        
        if (!keyData) return res.json({ error: 'Invalid API key', contact: OWNER });
        
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            await db.collection('api_keys').updateOne(
                { _id: keyData._id },
                { $set: { status: 'expired' } }
            );
            return res.json({ error: 'Key expired', contact: OWNER });
        }
        
        // Increment hits
        await db.collection('api_keys').updateOne(
            { _id: keyData._id },
            { $inc: { hits: 1 } }
        );
        
        if (endpoint === 'mistral') {
            const message = req.query.message || req.body.message;
            if (!message) return res.json({ error: 'Message required' });
            const result = await handleMistralAI(message);
            return res.json(cleanResponseData(result));
        }
        
        const proxyFn = apiProxyMap[endpoint];
        if (!proxyFn) return res.json({ error: 'Unknown endpoint', contact: OWNER });
        
        const targetUrl = proxyFn({ ...req.query, ...req.body });
        const response = await axios.get(targetUrl, { timeout: 30000 });
        let cleanedData = cleanResponseData(response.data);
        cleanedData.unlimited = keyData.unlimited_hits === 1;
        res.json(cleanedData);
        
    } catch (error) {
        res.json({ error: 'API request failed', details: error.message, contact: OWNER });
    }
});

app.get('/api-info', async (req, res) => {
    const apis = await db.collection('available_apis')
        .find({ is_active: 1 })
        .toArray();
    
    res.json({ 
        owner: OWNER, 
        channel: CHANNEL, 
        total_apis: apis.length, 
        apis: apis.map(api => ({
            name: api.name,
            display_name: api.display_name,
            endpoint: api.endpoint,
            required_params: api.required_params,
            description: api.description
        }))
    });
});

app.get('/health', (req, res) => { 
    res.json({ status: 'ok', timestamp: new Date().toISOString() }); 
});

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => { 
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message }); 
});

// ============ CRON JOBS ============
cron.schedule('0 0 * * *', async () => {
    try {
        // Expire old keys
        const now = new Date();
        await db.collection('api_keys').updateMany(
            { 
                expires_at: { $ne: null, $lt: now },
                status: { $ne: 'expired' }
            },
            { $set: { status: 'expired' } }
        );
        
        // Clean old rate limit data (7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        // If you have rate_limit_tracking collection with date field
        // await db.collection('rate_limit_tracking').deleteMany({
        //     date: { $lt: sevenDaysAgo.toISOString().split('T')[0] }
        // });
        
        console.log('✅ Cron job completed - expired keys cleaned');
    } catch (error) {
        console.error('❌ Cron job error:', error);
    }
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;

// Connect to DB and start server
(async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log('\n🚀 OSINT API HUB RUNNING');
            console.log(`📍 http://localhost:${PORT}`);
            console.log('👑 Head Admin: main / sahil');
            console.log('🔐 Admin: superadmin / aura@1234');
            console.log(`✅ Owner: ${OWNER}`);
            console.log(`✅ Channel: ${CHANNEL}`);
            console.log('✅ MongoDB Connected');
            console.log('=====================================\n');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
})();

module.exports = app;

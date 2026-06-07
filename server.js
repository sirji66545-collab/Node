require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const fs = require('fs');
const app = express();

// ========== MASTER API KEYS ==========
const MASTER_KEYS = {
    subhxco: 'RACKSUN',
    ftosint: 'sahil-newww',
    ayaanmods: 'annonymousai',
    truecallerLeak: 'RATELIMITE-BEIBBkim7bjTAkJIZTIUGPR4FkfNAYoj',
    mistral: 'FVKec5Xqa2ORzSoBrqi21nRbIM6rFk2q',
    rogers: 'Rogers2'
};

// ========== DATABASE SETUP ==========
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'api_keys.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    // Drop and recreate tables to fix issues
    db.run(`DROP TABLE IF EXISTS api_keys`);
    db.run(`DROP TABLE IF EXISTS users`);
    db.run(`DROP TABLE IF EXISTS rate_limit_tracking`);
    db.run(`DROP TABLE IF EXISTS analytics`);
    db.run(`DROP TABLE IF EXISTS daily_calls`);
    db.run(`DROP TABLE IF EXISTS api_status`);
    db.run(`DROP TABLE IF EXISTS available_apis`);
    
    // Users table
    db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // API keys table - FIXED: default allowed_apis is 'all'
    db.run(`CREATE TABLE api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        name TEXT,
        owner_username TEXT,
        owner_channel TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        hits INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        unlimited_hits INTEGER DEFAULT 0,
        allowed_apis TEXT DEFAULT '["all"]',
        is_custom INTEGER DEFAULT 0,
        rate_limit_enabled INTEGER DEFAULT 1,
        rate_limit_per_day INTEGER DEFAULT 100,
        rate_limit_per_hour INTEGER DEFAULT 20,
        rate_limit_per_minute INTEGER DEFAULT 5
    )`);

    // Rate limit tracking
    db.run(`CREATE TABLE rate_limit_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        date TEXT,
        hour INTEGER,
        minute INTEGER,
        requests INTEGER DEFAULT 0
    )`);

    // Analytics
    db.run(`CREATE TABLE analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        endpoint TEXT,
        status_code INTEGER,
        ip_address TEXT,
        date DATE DEFAULT CURRENT_DATE
    )`);

    // Daily calls
    db.run(`CREATE TABLE daily_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT,
        date DATE,
        calls INTEGER DEFAULT 0,
        UNIQUE(api_key, date)
    )`);

    // API status
    db.run(`CREATE TABLE api_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint_name TEXT,
        is_up INTEGER DEFAULT 1,
        last_checked DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Available APIs
    db.run(`CREATE TABLE available_apis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        display_name TEXT,
        endpoint TEXT,
        required_params TEXT,
        example_params TEXT,
        description TEXT,
        is_active INTEGER DEFAULT 1
    )`);

    // Create head admin
    db.get(`SELECT * FROM users WHERE username = 'main'`, [], (err, row) => {
        if (!row) {
            const headAdminPassword = bcrypt.hashSync('sahil', 10);
            db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
                ['main', headAdminPassword, 'head_admin', 'system']);
            console.log('✅ Head admin created');
        }
    });

    // Create super admin
    db.get(`SELECT * FROM users WHERE username = 'superadmin'`, [], (err, row) => {
        if (!row) {
            const superAdminPassword = bcrypt.hashSync('aura@1234', 10);
            db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
                ['superadmin', superAdminPassword, 'admin', 'main']);
            console.log('✅ Super admin created');
        }
    });

    // Insert APIs
    const apis = [
        ['vehicle_info', '🚗 Vehicle to Info', '/api/vehicle-info', 'vehicle', '{"vehicle":"UP42BB2572"}', 'Get vehicle challan/info'],
        ['telegram_num', '📞 Telegram to Number', '/api/telegram-num', 'term', '{"term":"7577179320"}', 'Get number from Telegram ID'],
        ['family_info', '👨‍👩‍👧‍👦 Family to Info', '/api/family-info', 'q', '{"q":"942660008471"}', 'Family information lookup'],
        ['number_info', '📱 Number to Info', '/api/number-info', 'q', '{"q":"9876543321"}', 'Complete number information'],
        ['aadhar_info', '🆔 Aadhar Info', '/api/aadhar-info', 'q', '{"q":"942660008471"}', 'Aadhar card information'],
        ['num_newinfo', '🔍 Number to New Info', '/api/num-newinfo', 'q', '{"q":"1234597890"}', 'Advanced number information'],
        ['email_info', '📧 Email Info', '/api/email-info', 'q', '{"q":"bhulgayakudhdaalle"}', 'Email address information'],
        ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'term', '{"term":"979607168114"}', 'Family relationship lookup'],
        ['num_india', '🇮🇳 Indian Number Info', '/api/num-india', 'num', '{"num":"9876543210"}', 'Indian mobile number details'],
        ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'number', '{"number":"03001234567"}', 'Pakistani mobile number'],
        ['name_details', '👤 Name to Details', '/api/name-details', 'name', '{"name":"abhiraaj"}', 'Name information'],
        ['bank_info', '🏦 Bank IFSC Info', '/api/bank', 'ifsc', '{"ifsc":"SBIN0001234"}', 'Bank branch details'],
        ['pan_info', '📄 PAN Card Info', '/api/pan', 'pan', '{"pan":"AXDPR2606K"}', 'PAN card details'],
        ['rc_info', '📋 RC Details', '/api/rc', 'owner', '{"owner":"HR26EV0001"}', 'Registration certificate'],
        ['ip_info', '🌐 IP Geolocation', '/api/ip', 'ip', '{"ip":"8.8.8.8"}', 'IP address location'],
        ['pincode_info', '📍 Pincode Info', '/api/pincode', 'pin', '{"pin":"110001"}', 'Area details'],
        ['git_info', '🐙 GitHub User', '/api/git', 'username', '{"username":"octocat"}', 'GitHub profile'],
        ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'uid', '{"uid":"5121439477"}', 'BGMI player stats'],
        ['ff_info', '🔫 FreeFire ID', '/api/ff', 'uid', '{"uid":"123456789"}', 'FreeFire player'],
        ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'prompt', '{"prompt":"cyberpunk cat"}', 'Generate AI images'],
        ['insta_info', '📸 Instagram Info', '/api/insta', 'username', '{"username":"ankit.vaid"}', 'Instagram profile'],
        ['num_fullinfo', '🔍 Number to Full Info', '/api/num-fullinfo', 'number', '{"number":"918887882236"}', 'Complete phone info'],
        ['mistral', '🤖 Mistral AI Chat', '/api/mistral', 'message', '{"message":"What is AI?"}', 'Chat with Mistral AI'],
        ['veh_to_num', '🚗 Vehicle to Number', '/api/veh-to-num', 'term', '{"term":"UP50P5434"}', 'Vehicle to mobile number']
    ];
    
    apis.forEach(api => {
        db.run(`INSERT INTO available_apis (name, display_name, endpoint, required_params, example_params, description) VALUES (?, ?, ?, ?, ?, ?)`, api);
    });
    console.log('✅ ' + apis.length + ' APIs inserted');
});

// ========== MIDDLEWARE ==========
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
    handler: (req, res) => res.json({ error: 'Rate limit exceeded', contact: '@Max_aura_need' })
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

// ========== RATE LIMIT FUNCTION ==========
async function checkRateLimit(apiKey, keyData) {
    if (keyData.unlimited_hits === 1) {
        return { allowed: true, unlimited: true };
    }
    
    if (keyData.rate_limit_enabled !== 1) {
        return { allowed: true };
    }
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    if (keyData.rate_limit_per_minute > 0) {
        const minuteCount = await getCount(apiKey, today, currentHour, currentMinute);
        if (minuteCount >= keyData.rate_limit_per_minute) {
            return { allowed: false, reason: `Per minute limit: ${keyData.rate_limit_per_minute}` };
        }
    }
    
    if (keyData.rate_limit_per_hour > 0) {
        const hourCount = await getCount(apiKey, today, currentHour, null);
        if (hourCount >= keyData.rate_limit_per_hour) {
            return { allowed: false, reason: `Per hour limit: ${keyData.rate_limit_per_hour}` };
        }
    }
    
    if (keyData.rate_limit_per_day > 0) {
        const dayCount = await getCount(apiKey, today, null, null);
        if (dayCount >= keyData.rate_limit_per_day) {
            return { allowed: false, reason: `Per day limit: ${keyData.rate_limit_per_day}` };
        }
    }
    
    await incrementCount(apiKey, today, null, null);
    await incrementCount(apiKey, today, currentHour, null);
    await incrementCount(apiKey, today, currentHour, currentMinute);
    
    return { allowed: true };
}

function getCount(apiKey, date, hour, minute) {
    return new Promise((resolve) => {
        let query = `SELECT SUM(requests) as total FROM rate_limit_tracking WHERE api_key = ? AND date = ?`;
        let params = [apiKey, date];
        
        if (hour !== null) {
            query += ` AND hour = ?`;
            params.push(hour);
        }
        if (minute !== null) {
            query += ` AND minute = ?`;
            params.push(minute);
        }
        
        db.get(query, params, (err, row) => {
            resolve(row ? (row.total || 0) : 0);
        });
    });
}

function incrementCount(apiKey, date, hour, minute) {
    return new Promise((resolve) => {
        const query = `INSERT INTO rate_limit_tracking (api_key, date, hour, minute, requests)
                       VALUES (?, ?, ?, ?, 1)`;
        const params = [apiKey, date, hour !== null ? hour : 0, minute !== null ? minute : 0];
        db.run(query, params, () => resolve());
    });
}

// ========== API PROXY MAP ==========
const apiProxyMap = {
    'vehicle-info': (p) => `http://104.248.231.22:5000/challan/${p.vehicle || p.q || p.term}`,
    'telegram-num': (p) => `http://api.subhxcosmo.in/api?key=${MASTER_KEYS.subhxco}&type=tg&term=${p.term || p.id || p.number}`,
    'family-info': (p) => `https://ayush-multi-apiv2.onrender.com/adhar?q=${p.q || p.term || p.id}`,
    'number-info': (p) => `https://believes-shore-funny-void.trycloudflare.com/search?q=${p.q || p.number || p.num}`,
    'aadhar-info': (p) => `https://believes-shore-funny-void.trycloudflare.com/search?q=${p.q || p.num || p.aadhar}`,
    'num-newinfo': (p) => `https://ayush-multi-apiv2.onrender.com/num?q=${p.q || p.number || p.num}`,
    'email-info': (p) => `https://believes-shore-funny-void.trycloudflare.com/search?q=${p.q || p.email}`,
    'family': (p) => `https://ayaanmods.site/family.php?key=${MASTER_KEYS.subhxco}&term=${p.term}`,
    'num-india': (p) => `https://ft-osint-api.duckdns.org/api/number?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'num-pak': (p) => `https://ft-osint-api.duckdns.org/api/pk?key=${MASTER_KEYS.ftosint}&number=${p.number}`,
    'name-details': (p) => `https://ft-osint-api.duckdns.org/api/name?key=${MASTER_KEYS.ftosint}&name=${p.name}`,
    'bank': (p) => `https://ft-osint-api.duckdns.org/api/ifsc?key=${MASTER_KEYS.ftosint}&ifsc=${p.ifsc}`,
    'pan': (p) => `https://ft-osint-api.duckdns.org/api/pan?key=${MASTER_KEYS.ftosint}&pan=${p.pan}`,
    'vehicle': (p) => `https://ft-osint-api.duckdns.org/api/vehicle?key=${MASTER_KEYS.ftosint}&vehicle=${p.vehicle}`,
    'rc': (p) => `https://ft-osint-api.duckdns.org/api/rc?key=${MASTER_KEYS.ftosint}&owner=${p.owner}`,
    'ip': (p) => `https://ft-osint-api.duckdns.org/api/ip?key=${MASTER_KEYS.ftosint}&ip=${p.ip}`,
    'pincode': (p) => `https://ft-osint-api.duckdns.org/api/pincode?key=${MASTER_KEYS.ftosint}&pin=${p.pin}`,
    'git': (p) => `https://ft-osint-api.duckdns.org/api/git?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'bgmi': (p) => `https://ft-osint-api.duckdns.org/api/bgmi?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'ff': (p) => `https://ft-osint-api.duckdns.org/api/ff?key=${MASTER_KEYS.ftosint}&uid=${p.uid}`,
    'aadhar': (p) => `https://ft-osint-api.duckdns.org/api/aadhar?key=${MASTER_KEYS.ftosint}&num=${p.num}`,
    'ai-image': (p) => `https://ayaanmods.site/aiimage.php?key=${MASTER_KEYS.ayaanmods}&prompt=${p.prompt}`,
    'insta': (p) => `https://ft-osint-api.duckdns.org/api/insta?key=${MASTER_KEYS.ftosint}&username=${p.username}`,
    'num-fullinfo': (p) => `https://say-wallahai-bro-say-wallahi.onrender.com/raavan/v34/query=${p.number}/key=${MASTER_KEYS.truecallerLeak}`,
    'mistral': `mistral-direct`,
    'veh-to-num': (p) => `https://surya-veh-num-xmrewqs.ramaxinfo.workers.dev/?term=${p.term || p.vehicle || p.num}`
};

// ========== CLEAN RESPONSE ==========
function cleanResponseData(data) {
    if (!data || typeof data !== 'object') return data;
    
    let cleaned = JSON.parse(JSON.stringify(data));
    
    const removeFields = ['Developer', 'DM TO BUY ACCESS', 'owner', 'xtradeep', 'Kon_Hu_Mai', 'channel', 'telegram', 'contact', 'instagram', 'twitter', 'fb', 'facebook', 'website', 'github', 'created_by', 'owner_username', 'owner_channel', 'credit', 'Credits', 'Credit', 'Source', 'source', 'provider', 'Provider', 'api_source', 'API_Source'];
    
    function cleanObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (let key in obj) {
            if (removeFields.includes(key.toLowerCase()) || removeFields.includes(key)) {
                delete obj[key];
            } 
            else if (typeof obj[key] === 'string') {
                if (obj[key].includes('@') && !obj[key].includes('Max_aura_need') && !obj[key].includes('OSINTNXERA')) {
                    delete obj[key];
                }
            }
            else if (typeof obj[key] === 'object') {
                cleanObject(obj[key]);
            }
        }
    }
    
    cleanObject(cleaned);
    
    cleaned.owner = '@Max_aura_need';
    cleaned.channel = '@OSINTNXERA';
    
    return cleaned;
}

// ========== PUBLIC ROUTES ==========
app.get('/', (req, res) => {
    db.get('SELECT COUNT(*) as total_apis FROM available_apis', [], (err, apisCount) => {
        db.get('SELECT COUNT(*) as total_keys FROM api_keys', [], (err, keysCount) => {
            db.get('SELECT SUM(hits) as total_hits FROM api_keys', [], (err, hitsTotal) => {
                res.render('index', { 
                    user: req.session.user || null,
                    totalApis: apisCount ? apisCount.total_apis : 0,
                    totalKeys: keysCount ? keysCount.total_keys : 0,
                    totalHits: hitsTotal ? hitsTotal.total_hits : 0
                });
            });
        });
    });
});

app.get('/endpoints', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
        const formattedApis = (apis || []).map(api => {
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
                full_url: `${api.endpoint}`,
                example_usage: `${api.endpoint}?key=YOUR_API_KEY&${paramName}=${params[paramName] || 'value'}`
            };
        });
        
        res.render('endpoints', { 
            apis: formattedApis, 
            baseUrl: req.protocol + '://' + req.get('host'),
            statusMap: {}
        });
    });
});

app.get('/docs', (req, res) => {
    db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
        const formattedApis = (apis || []).map(api => {
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
                full_url: `${api.endpoint}`,
                example_usage: `${api.endpoint}?key=YOUR_API_KEY&${paramName}=${params[paramName] || 'value'}`
            };
        });
        
        res.render('docs', { 
            apis: formattedApis, 
            baseUrl: req.protocol + '://' + req.get('host'),
            statusMap: {}
        });
    });
});

app.get('/login', (req, res) => {
    res.render('login', { error: req.query.error || null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.redirect('/login?error=missing');
    }
    
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.redirect('/login?error=invalid');
        }
        
        try {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.user = { 
                    id: user.id, 
                    username: user.username, 
                    role: user.role 
                };
                
                if (user.role === 'head_admin') {
                    return res.redirect('/head-admin/dashboard');
                } else {
                    return res.redirect('/admin/dashboard');
                }
            } else {
                return res.redirect('/login?error=invalid');
            }
        } catch (bcryptError) {
            return res.redirect('/login?error=server_error');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ========== HEAD ADMIN DASHBOARD ==========
app.get('/head-admin/dashboard', requireHeadAdmin, (req, res) => {
    db.all('SELECT id, username, role, created_by, created_at FROM users WHERE role != "head_admin"', [], (err, admins) => {
        db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
            db.get('SELECT SUM(hits) as total_hits FROM api_keys', [], (err, totalHits) => {
                res.render('head_admin_dashboard', {
                    user: req.session.user,
                    admins: admins || [],
                    keys: keys || [],
                    totalHits: totalHits ? totalHits.total_hits : 0,
                    popular: [],
                    topUsers: [],
                    todayCalls: {}
                });
            });
        });
    });
});

app.post('/head-admin/update-rate-limit', requireHeadAdmin, (req, res) => {
    const { key_id, unlimited_hits, rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute } = req.body;
    
    const isUnlimited = unlimited_hits === 'true';
    
    db.run(`UPDATE api_keys 
            SET unlimited_hits = ?,
                rate_limit_enabled = ?,
                rate_limit_per_day = ?,
                rate_limit_per_hour = ?,
                rate_limit_per_minute = ?
            WHERE id = ?`,
            [isUnlimited ? 1 : 0, 
             isUnlimited ? 0 : (rate_limit_enabled === 'true' ? 1 : 0),
             rate_limit_per_day || 100,
             rate_limit_per_hour || 20,
             rate_limit_per_minute || 5,
             key_id],
            function(err) {
                if (err) return res.json({ error: err.message });
                res.json({ success: true });
            });
});

app.post('/head-admin/create-admin', requireHeadAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
        return res.json({ error: 'Username and password required' });
    }
    
    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, existing) => {
        if (existing) return res.json({ error: 'Username already exists' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`,
            [username, hashedPassword, role || 'admin', req.session.user.username],
            function(err) {
                if (err) return res.json({ error: err.message });
                res.json({ success: true });
            });
    });
});

app.post('/head-admin/remove-admin', requireHeadAdmin, (req, res) => {
    const { admin_id } = req.body;
    db.run('DELETE FROM users WHERE id = ? AND role != "head_admin"', [admin_id], function(err) {
        if (err) return res.json({ error: err.message });
        res.json({ success: true });
    });
});

// ========== ADMIN DASHBOARD ==========
app.get('/admin/dashboard', requireAuth, (req, res) => {
    if (req.session.user.role === 'head_admin') {
        return res.redirect('/head-admin/dashboard');
    }
    
    db.all('SELECT * FROM api_keys ORDER BY created_at DESC', [], (err, keys) => {
        db.get('SELECT SUM(hits) as total FROM api_keys', [], (err, hits) => {
            db.get('SELECT COUNT(*) as active FROM api_keys WHERE status="active"', [], (err, active) => {
                db.all('SELECT * FROM available_apis WHERE is_active = 1', [], (err, apis) => {
                    const formattedApis = (apis || []).map(api => {
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
                            param_example: params[paramName] || 'value'
                        };
                    });
                    
                    res.render('dashboard', { 
                        keys: keys || [], 
                        totalHits: hits ? hits.total : 0,
                        active: active ? active.active : 0,
                        apis: formattedApis,
                        popular: [],
                        topUsers: [],
                        todayCalls: {},
                        user: req.session.user,
                        baseUrl: req.protocol + '://' + req.get('host')
                    });
                });
            });
        });
    });
});

// ========== FIXED: GENERATE KEY WITH 'all' PERMISSIONS ==========
app.post('/admin/generate-key', requireAuth, (req, res) => {
    const { name, expiry, unlimited_hits, allowed_apis, custom_key, enable_custom,
            rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute } = req.body;
    
    function createKey(apiKey, isCustom) {
        let expires_at = null;
        const now = new Date();
        
        if (expiry === '7d') expires_at = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
        else if (expiry === '15d') expires_at = new Date(now.getTime() + (15 * 24 * 60 * 60 * 1000));
        else if (expiry === '1m') expires_at = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        else if (expiry === '1y') expires_at = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000));
        
        // FIXED: Always set to 'all' if allowed_apis is 'all' or undefined
        let allowedApisJson = '["all"]';
        if (allowed_apis && allowed_apis !== 'all' && allowed_apis !== 'undefined') {
            allowedApisJson = JSON.stringify([allowed_apis]);
        }
        
        const isUnlimited = unlimited_hits === 'true';
        const rateLimitEnabled = isUnlimited ? 0 : (rate_limit_enabled === 'true' ? 1 : 1); // Default enabled
        
        const finalOwner = '@Max_aura_need';
        const finalChannel = '@OSINTNXERA';
        
        db.run(`INSERT INTO api_keys (key, name, owner_username, owner_channel, expires_at, unlimited_hits, allowed_apis, status, is_custom,
                rate_limit_enabled, rate_limit_per_day, rate_limit_per_hour, rate_limit_per_minute)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`, 
                [apiKey, name, finalOwner, finalChannel, expires_at, 
                 isUnlimited ? 1 : 0, allowedApisJson, isCustom ? 1 : 0,
                 rateLimitEnabled,
                 isUnlimited ? 0 : (rate_limit_per_day || 100),
                 isUnlimited ? 0 : (rate_limit_per_hour || 20),
                 isUnlimited ? 0 : (rate_limit_per_minute || 5)], 
                function(err) {
                    if (err) {
                        return res.status(500).send('Error: ' + err.message);
                    }
                    res.redirect('/admin/dashboard');
                });
    }
    
    if (enable_custom === 'true' && custom_key && custom_key.trim() !== '') {
        let apiKey = custom_key.trim();
        if (apiKey.includes(' ') || apiKey.length < 5) {
            return res.status(400).send('Invalid custom key (min 5 chars, no spaces)');
        }
        db.get('SELECT key FROM api_keys WHERE key = ?', [apiKey], (err, existing) => {
            if (existing) return res.status(400).send('Key already exists');
            createKey(apiKey, true);
        });
    } else {
        let apiKey = 'OSINT_' + Math.random().toString(36).substring(2, 18).toUpperCase();
        createKey(apiKey, false);
    }
});

app.post('/admin/delete-key', requireAuth, (req, res) => {
    db.run('DELETE FROM api_keys WHERE id = ?', [req.body.id]);
    res.redirect('/admin/dashboard');
});

app.post('/admin/toggle-status', requireAuth, (req, res) => {
    const { id, status } = req.body;
    db.run('UPDATE api_keys SET status = ? WHERE id = ?', [status === 'active' ? 'disabled' : 'active', id]);
    res.redirect('/admin/dashboard');
});

// ========== MISTRAL AI ==========
async function handleMistralAI(message) {
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: 'mistral-medium-latest',
            messages: [{ role: "user", content: message }]
        }, {
            headers: { 'Authorization': `Bearer ${MASTER_KEYS.mistral}`, 'Content-Type': 'application/json' },
            timeout: 30000
        });
        return { success: true, response: response.data.choices[0].message.content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ========== MAIN API HANDLER - FIXED ==========
app.all('/api/:endpoint', globalLimiter, async (req, res) => {
    const userKey = req.query.key || req.body.key;
    const endpoint = req.params.endpoint;
    const today = new Date().toISOString().split('T')[0];
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!userKey) {
        return res.json({ error: 'API key required', contact: '@Max_aura_need' });
    }
    
    db.get('SELECT * FROM api_keys WHERE key = ? AND status = "active"', [userKey], async (err, keyData) => {
        if (err || !keyData) {
            return res.json({ error: 'Invalid API key', contact: '@Max_aura_need' });
        }
        
        const rateCheck = await checkRateLimit(userKey, keyData);
        if (!rateCheck.allowed) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, 429, clientIp, today]);
            return res.json({ error: rateCheck.reason, contact: '@Max_aura_need' });
        }
        
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            db.run('UPDATE api_keys SET status = "expired" WHERE id = ?', [keyData.id]);
            return res.json({ error: 'Key expired', contact: '@Max_aura_need' });
        }
        
        // FIXED: Properly check allowed APIs
        let allowedApis = [];
        try { 
            allowedApis = JSON.parse(keyData.allowed_apis || '["all"]'); 
        } catch(e) { 
            allowedApis = ['all']; 
        }
        
        // If 'all' is in allowed APIs, skip restriction
        const isAllowed = allowedApis.includes('all') || allowedApis.includes(endpoint);
        
        if (!isAllowed) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, 403, clientIp, today]);
            return res.json({ error: 'Endpoint not allowed for this key', contact: '@Max_aura_need' });
        }
        
        db.run('UPDATE api_keys SET hits = hits + 1 WHERE id = ?', [keyData.id]);
        db.run(`INSERT INTO daily_calls (api_key, date, calls) VALUES (?, ?, 1) 
                ON CONFLICT(api_key, date) DO UPDATE SET calls = calls + 1`, [userKey, today]);
        
        if (endpoint === 'mistral') {
            const message = req.query.message || req.body.message;
            if (!message) {
                return res.json({ error: 'Message required' });
            }
            const result = await handleMistralAI(message);
            const cleanedResult = cleanResponseData(result);
            return res.json(cleanedResult);
        }
        
        const proxyFn = apiProxyMap[endpoint];
        if (!proxyFn) {
            return res.json({ error: 'Unknown endpoint', contact: '@Max_aura_need' });
        }
        
        try {
            const targetUrl = proxyFn({ ...req.query, ...req.body });
            const response = await axios.get(targetUrl, { timeout: 30000 });
            let cleanedData = cleanResponseData(response.data);
            cleanedData.unlimited = keyData.unlimited_hits === 1;
            
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, response.status, clientIp, today]);
            res.json(cleanedData);
        } catch (error) {
            db.run(`INSERT INTO analytics (api_key, endpoint, status_code, ip_address, date) VALUES (?, ?, ?, ?, ?)`,
                [userKey, endpoint, 500, clientIp, today]);
            res.json({ error: 'API request failed', details: error.message, contact: '@Max_aura_need' });
        }
    });
});

app.get('/api-info', (req, res) => {
    db.all('SELECT name, display_name, endpoint, required_params, description FROM available_apis WHERE is_active = 1', [], (err, apis) => {
        res.json({
            owner: '@Max_aura_need',
            channel: '@OSINTNXERA',
            total_apis: (apis || []).length,
            apis: apis || []
        });
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

cron.schedule('0 0 * * *', () => {
    console.log('🔄 Daily reset running...');
    db.run(`UPDATE api_keys SET status = 'expired' WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')`);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0];
    db.run(`DELETE FROM rate_limit_tracking WHERE date < ?`, [dateStr]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n🚀 OSINT API HUB RUNNING');
    console.log(`📍 http://localhost:${PORT}`);
    console.log('👑 Head Admin: main / sahil');
    console.log('🔐 Admin: superadmin / aura@1234');
    console.log('✅ Owner: @Max_aura_need');
    console.log('✅ Channel: @OSINTNXERA');
    console.log('✅ FIXED: All endpoints allowed by default');
    console.log('✅ FIXED: Custom key generation working');
    console.log('=====================================\n');
});

module.exports = app;

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, 'api_keys.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // ============ USERS TABLE ============
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    status TEXT DEFAULT 'active'
  )`);

  // ============ API KEYS TABLE ============
  db.run(`CREATE TABLE IF NOT EXISTS api_keys (
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

  // ============ RATE LIMIT TRACKING ============
  db.run(`CREATE TABLE IF NOT EXISTS rate_limit_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT,
    date TEXT,
    hour INTEGER,
    minute INTEGER,
    requests INTEGER DEFAULT 0
  )`);

  // ============ ANALYTICS TABLE ============
  db.run(`CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT,
    endpoint TEXT,
    status_code INTEGER,
    ip_address TEXT,
    date DATE DEFAULT CURRENT_DATE,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============ DAILY CALLS TABLE ============
  db.run(`CREATE TABLE IF NOT EXISTS daily_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT,
    date DATE,
    calls INTEGER DEFAULT 0,
    UNIQUE(api_key, date)
  )`);

  // ============ API STATUS TABLE ============
  db.run(`CREATE TABLE IF NOT EXISTS api_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_name TEXT,
    is_up BOOLEAN DEFAULT 1,
    last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
    response_ms INTEGER
  )`);

  // ============ AVAILABLE APIS TABLE ============
  db.run(`CREATE TABLE IF NOT EXISTS available_apis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    display_name TEXT,
    endpoint TEXT,
    required_params TEXT,
    example_params TEXT,
    description TEXT,
    is_active INTEGER DEFAULT 1
  )`);

  // ============ ACTIVITY LOGS TABLE ============
  db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    action TEXT,
    details TEXT,
    ip TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============ SYSTEM SETTINGS TABLE ============
  db.run(`CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE,
    setting_value TEXT,
    setting_type TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ============ INSERT DEFAULT USERS ============
  const mainPassword = bcrypt.hashSync('sahil', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
    ['main', mainPassword, 'head_admin', 'system']);

  const adminPassword = bcrypt.hashSync('aura@1234', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)`, 
    ['superadmin', adminPassword, 'admin', 'main']);

  // ============ INSERT DEFAULT SETTINGS ============
  const defaultSettings = [
    ['theme', 'dark', 'string'],
    ['maintenance_mode', 'false', 'boolean'],
    ['rate_limit_global', '30', 'number'],
    ['rate_limit_window', '60', 'number']
  ];
  
  defaultSettings.forEach(setting => {
    db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value, setting_type) VALUES (?, ?, ?)`, setting);
  });

  // ============ INSERT ALL 24 APIS ============
  const apis = [
    ['vehicle_info', '🚗 Vehicle Info', '/api/vehicle-info', 'vehicle', '{"vehicle":"UP42BB2572"}', 'Get vehicle challan/info'],
    ['telegram_num', '📞 Telegram to Number', '/api/telegram-num', 'term', '{"term":"7577179320"}', 'Get number from Telegram ID'],
    ['family_info', '👨‍👩‍👧‍👦 Family Info', '/api/family-info', 'q', '{"q":"942660008471"}', 'Family information lookup'],
    ['number_info', '📱 Number Info', '/api/number-info', 'q', '{"q":"9876543321"}', 'Complete number information'],
    ['aadhar_info', '🆔 Aadhar Info', '/api/aadhar-info', 'q', '{"q":"942660008471"}', 'Aadhar card information'],
    ['num_newinfo', '🔍 Number New Info', '/api/num-newinfo', 'q', '{"q":"1234597890"}', 'Advanced number information'],
    ['email_info', '📧 Email Info', '/api/email-info', 'q', '{"q":"test@email.com"}', 'Email address information'],
    ['family', '👨‍👩‍👧‍👦 Family Tree', '/api/family', 'term', '{"term":"979607168114"}', 'Family relationship lookup'],
    ['num_india', '🇮🇳 Indian Number', '/api/num-india', 'num', '{"num":"9876543210"}', 'Indian mobile number details'],
    ['num_pak', '🇵🇰 Pakistani Number', '/api/num-pak', 'number', '{"number":"03001234567"}', 'Pakistani mobile number'],
    ['name_details', '👤 Name Details', '/api/name-details', 'name', '{"name":"abhiraaj"}', 'Name information'],
    ['bank_info', '🏦 Bank IFSC', '/api/bank', 'ifsc', '{"ifsc":"SBIN0001234"}', 'Bank branch details'],
    ['pan_info', '📄 PAN Card', '/api/pan', 'pan', '{"pan":"AXDPR2606K"}', 'PAN card details'],
    ['rc_info', '📋 RC Details', '/api/rc', 'owner', '{"owner":"HR26EV0001"}', 'Registration certificate'],
    ['ip_info', '🌐 IP Geolocation', '/api/ip', 'ip', '{"ip":"8.8.8.8"}', 'IP address location'],
    ['pincode_info', '📍 Pincode Info', '/api/pincode', 'pin', '{"pin":"110001"}', 'Area details'],
    ['git_info', '🐙 GitHub User', '/api/git', 'username', '{"username":"octocat"}', 'GitHub profile'],
    ['bgmi_info', '🎮 BGMI Player', '/api/bgmi', 'uid', '{"uid":"5121439477"}', 'BGMI player stats'],
    ['ff_info', '🔫 FreeFire ID', '/api/ff', 'uid', '{"uid":"123456789"}', 'FreeFire player'],
    ['ai_image', '🎨 AI Image Gen', '/api/ai-image', 'prompt', '{"prompt":"cyberpunk cat"}', 'Generate AI images'],
    ['insta_info', '📸 Instagram Info', '/api/insta', 'username', '{"username":"cristiano"}', 'Instagram profile'],
    ['num_fullinfo', '🔍 Number Full Info', '/api/num-fullinfo', 'number', '{"number":"918887882236"}', 'Complete phone info'],
    ['mistral', '🤖 Mistral AI', '/api/mistral', 'message', '{"message":"What is AI?"}', 'Chat with Mistral AI'],
    ['veh_to_num', '🚗 Vehicle to Number', '/api/veh-to-num', 'term', '{"term":"UP50P5434"}', 'Vehicle to mobile number']
  ];
  
  apis.forEach(api => {
    db.run(`INSERT OR IGNORE INTO available_apis (name, display_name, endpoint, required_params, example_params, description) VALUES (?, ?, ?, ?, ?, ?)`, api);
  });

  console.log('✅ Database initialized successfully');
  console.log('👑 Head Admin: main / sahil');
  console.log('🔐 Admin: superadmin / aura@1234');
  console.log('📊 Total APIs: ' + apis.length);
});

module.exports = db;

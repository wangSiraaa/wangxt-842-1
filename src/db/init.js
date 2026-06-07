const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'pumping_station.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function init() {
  const createTables = [
    `CREATE TABLE IF NOT EXISTS pumping_stations (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      location TEXT,
      warning_level REAL NOT NULL,
      design_flow REAL,
      pump_count INTEGER DEFAULT 1,
      status TEXT DEFAULT 'normal',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS duty_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id TEXT NOT NULL,
      shift_date TEXT NOT NULL,
      shift_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (station_id) REFERENCES pumping_stations(id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS duty_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id TEXT NOT NULL,
      shift_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      checkin_time TEXT DEFAULT CURRENT_TIMESTAMP,
      checkin_type TEXT DEFAULT 'on_duty',
      remarks TEXT,
      FOREIGN KEY (station_id) REFERENCES pumping_stations(id),
      FOREIGN KEY (shift_id) REFERENCES duty_shifts(id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS water_level_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id TEXT NOT NULL,
      reporter TEXT NOT NULL,
      water_level REAL NOT NULL,
      rainfall REAL DEFAULT 0,
      report_time TEXT DEFAULT CURRENT_TIMESTAMP,
      is_over_warning INTEGER DEFAULT 0,
      remarks TEXT,
      FOREIGN KEY (station_id) REFERENCES pumping_stations(id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS pump_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id TEXT NOT NULL,
      shift_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      pump_number INTEGER NOT NULL,
      operation_type TEXT NOT NULL,
      operation_time TEXT DEFAULT CURRENT_TIMESTAMP,
      start_level REAL,
      end_level REAL,
      duration INTEGER,
      status TEXT DEFAULT 'confirmed',
      remarks TEXT,
      FOREIGN KEY (station_id) REFERENCES pumping_stations(id),
      FOREIGN KEY (shift_id) REFERENCES duty_shifts(id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS pump_faults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id TEXT NOT NULL,
      pump_number INTEGER NOT NULL,
      fault_type TEXT NOT NULL,
      fault_level TEXT DEFAULT 'medium',
      fault_description TEXT,
      report_time TEXT DEFAULT CURRENT_TIMESTAMP,
      reporter TEXT NOT NULL,
      repair_status TEXT DEFAULT 'pending',
      repair_time TEXT,
      repairer TEXT,
      repair_notes TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (station_id) REFERENCES pumping_stations(id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      alert_level TEXT DEFAULT 'warning',
      alert_message TEXT NOT NULL,
      water_level REAL,
      threshold_level REAL,
      triggered_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      handled_at TEXT,
      handled_by TEXT,
      handle_notes TEXT,
      FOREIGN KEY (station_id) REFERENCES pumping_stations(id)
    )`
  ];
  
  for (const sql of createTables) {
    await run(sql);
  }
  
  const createIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_station_status ON pumping_stations(status)',
    'CREATE INDEX IF NOT EXISTS idx_shift_station_date ON duty_shifts(station_id, shift_date)',
    'CREATE INDEX IF NOT EXISTS idx_checkin_shift ON duty_checkins(shift_id)',
    'CREATE INDEX IF NOT EXISTS idx_water_level_station ON water_level_reports(station_id, report_time)',
    'CREATE INDEX IF NOT EXISTS idx_operation_station ON pump_operations(station_id, operation_time)',
    'CREATE INDEX IF NOT EXISTS idx_fault_station ON pump_faults(station_id, repair_status)',
    'CREATE INDEX IF NOT EXISTS idx_alert_status ON alerts(station_id, status)'
  ];
  
  for (const sql of createIndexes) {
    await run(sql);
  }
  
  const stations = [
    ['PS001', 'PS001', '东城区一号泵站', '东城区沿河路1号', 3.5, 500, 3],
    ['PS002', 'PS002', '西城区二号泵站', '西城区防汛路88号', 3.2, 400, 2],
    ['PS003', 'PS003', '南城区三号泵站', '南城区滨江大道256号', 3.8, 600, 4],
    ['PS004', 'PS004', '北城区四号泵站', '北城区工业大道15号', 3.0, 300, 2]
  ];
  
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO pumping_stations (id, code, name, location, warning_level, design_flow, pump_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const station of stations) {
    await new Promise((resolve, reject) => {
      insertStmt.run(station, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  insertStmt.finalize();
  
  console.log('数据库初始化成功！');
  console.log(`数据库文件位置: ${dbPath}`);
  console.log(`已预置 ${stations.length} 个泵站档案`);
  
  db.close();
}

init().catch(err => {
  console.error('初始化失败:', err);
  process.exit(1);
});

const moment = require('moment');
const { queryOne, execute } = require('../db');

function getTodayShiftType() {
  const hour = moment().hour();
  if (hour >= 8 && hour < 16) return 'day';
  if (hour >= 16 && hour < 24) return 'night';
  return 'dawn';
}

async function ensureShiftExists(stationId) {
  const today = moment().format('YYYY-MM-DD');
  const shiftType = getTodayShiftType();
  
  let shift = await queryOne(`
    SELECT * FROM duty_shifts 
    WHERE station_id = ? AND shift_date = ? AND shift_type = ?
  `, [stationId, today, shiftType]);
  
  if (!shift) {
    const result = await execute(`
      INSERT INTO duty_shifts (station_id, shift_date, shift_type, status)
      VALUES (?, ?, ?, 'active')
    `, [stationId, today, shiftType]);
    shift = await queryOne('SELECT * FROM duty_shifts WHERE id = ?', [result.lastID]);
  }
  
  return shift;
}

async function hasShiftCheckin(shiftId) {
  const row = await queryOne(`
    SELECT COUNT(*) as count FROM duty_checkins WHERE shift_id = ?
  `, [shiftId]);
  return row.count > 0;
}

async function isPumpFaulty(stationId, pumpNumber) {
  const row = await queryOne(`
    SELECT COUNT(*) as count FROM pump_faults 
    WHERE station_id = ? AND pump_number = ? AND repair_status != 'resolved'
  `, [stationId, pumpNumber]);
  return row.count > 0;
}

async function hasRecentPumpOperation(stationId) {
  const tenMinutesAgo = moment().subtract(10, 'minutes').format('YYYY-MM-DD HH:mm:ss');
  const row = await queryOne(`
    SELECT COUNT(*) as count FROM pump_operations 
    WHERE station_id = ? AND operation_type = 'start' AND operation_time >= ?
  `, [stationId, tenMinutesAgo]);
  return row.count > 0;
}

async function hasPendingAlert(stationId, alertType) {
  const row = await queryOne(`
    SELECT COUNT(*) as count FROM alerts 
    WHERE station_id = ? AND alert_type = ? AND status = 'pending'
  `, [stationId, alertType]);
  return row.count > 0;
}

async function generateAlert(stationId, alertType, alertLevel, message, waterLevel, thresholdLevel) {
  if (await hasPendingAlert(stationId, alertType)) {
    return null;
  }
  
  const result = await execute(`
    INSERT INTO alerts (station_id, alert_type, alert_level, alert_message, water_level, threshold_level)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [stationId, alertType, alertLevel, message, waterLevel, thresholdLevel]);
  
  return await queryOne('SELECT * FROM alerts WHERE id = ?', [result.lastID]);
}

async function checkAndGenerateWaterLevelAlert(stationId, waterLevel) {
  const station = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [stationId]);
  if (!station) return null;
  
  if (waterLevel > station.warning_level) {
    if (await hasRecentPumpOperation(stationId)) {
      return null;
    }
    
    const alertType = 'water_level_over_no_pump';
    const alertLevel = waterLevel > station.warning_level + 0.5 ? 'critical' : 'warning';
    const message = `泵站[${station.name}]水位${waterLevel}米超过警戒线${station.warning_level}米，但10分钟内无开泵记录，请立即处理！`;
    
    return await generateAlert(stationId, alertType, alertLevel, message, waterLevel, station.warning_level);
  }
  
  return null;
}

function validatePumpOperation() {
  return async function(req, res, next) {
    try {
      const { station_id, pump_number } = req.body;
      
      const shift = await ensureShiftExists(station_id);
      
      if (!await hasShiftCheckin(shift.id)) {
        return res.status(400).json({
          success: false,
          message: '当前班次无人签到，不能确认开泵运行',
          code: 'NO_CHECKIN_FOR_SHIFT'
        });
      }
      
      if (await isPumpFaulty(station_id, pump_number)) {
        return res.status(400).json({
          success: false,
          message: `第${pump_number}号泵存在未处理故障，不能参与调度`,
          code: 'PUMP_IS_FAULTY'
        });
      }
      
      req.shift = shift;
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function processWaterLevelAlert(stationId, waterLevel) {
  return await checkAndGenerateWaterLevelAlert(stationId, waterLevel);
}

module.exports = {
  ensureShiftExists,
  hasShiftCheckin,
  isPumpFaulty,
  hasRecentPumpOperation,
  validatePumpOperation,
  processWaterLevelAlert,
  getTodayShiftType
};

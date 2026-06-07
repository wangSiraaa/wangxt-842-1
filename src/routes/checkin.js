const express = require('express');
const router = express.Router();
const { query, queryOne, execute } = require('../db');
const { ensureShiftExists, hasShiftCheckin } = require('../middleware/businessRules');

router.post('/', async (req, res, next) => {
  try {
    const { station_id, operator_name, checkin_type, remarks } = req.body;
    
    if (!station_id || !operator_name) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：station_id, operator_name'
      });
    }
    
    const station = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [station_id]);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: '泵站不存在'
      });
    }
    
    const shift = await ensureShiftExists(station_id);
    
    const result = await execute(`
      INSERT INTO duty_checkins (station_id, shift_id, operator_name, checkin_type, remarks)
      VALUES (?, ?, ?, ?, ?)
    `, [station_id, shift.id, operator_name, checkin_type || 'on_duty', remarks || '']);
    
    const checkin = await queryOne('SELECT * FROM duty_checkins WHERE id = ?', [result.lastID]);
    
    res.json({
      success: true,
      data: checkin,
      message: '签到成功'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { station_id, shift_id, start_date, end_date, page = 1, page_size = 20 } = req.query;
    const offset = (page - 1) * page_size;
    
    let whereClause = [];
    const params = [];
    
    if (station_id) {
      whereClause.push('c.station_id = ?');
      params.push(station_id);
    }
    
    if (shift_id) {
      whereClause.push('c.shift_id = ?');
      params.push(shift_id);
    }
    
    if (start_date) {
      whereClause.push('DATE(c.checkin_time) >= ?');
      params.push(start_date);
    }
    
    if (end_date) {
      whereClause.push('DATE(c.checkin_time) <= ?');
      params.push(end_date);
    }
    
    const whereSql = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';
    
    const countRow = await queryOne(`
      SELECT COUNT(*) as total FROM duty_checkins c ${whereSql}
    `, params);
    
    const checkins = await query(`
      SELECT c.*, s.code as station_code, s.name as station_name,
             sh.shift_date, sh.shift_type
      FROM duty_checkins c
      LEFT JOIN pumping_stations s ON c.station_id = s.id
      LEFT JOIN duty_shifts sh ON c.shift_id = sh.id
      ${whereSql}
      ORDER BY c.checkin_time DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(page_size), offset]);
    
    res.json({
      success: true,
      data: {
        list: checkins,
        total: countRow.total,
        page: parseInt(page),
        page_size: parseInt(page_size)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/shift/:shift_id', async (req, res, next) => {
  try {
    const checkins = await query(`
      SELECT c.*, s.code as station_code, s.name as station_name
      FROM duty_checkins c
      LEFT JOIN pumping_stations s ON c.station_id = s.id
      WHERE c.shift_id = ?
      ORDER BY c.checkin_time
    `, [req.params.shift_id]);
    
    res.json({
      success: true,
      data: checkins
    });
  } catch (err) {
    next(err);
  }
});

router.get('/today/:station_id', async (req, res, next) => {
  try {
    const stationId = req.params.station_id;
    const shift = await ensureShiftExists(stationId);
    const hasCheckin = await hasShiftCheckin(shift.id);
    
    const checkins = await query(`
      SELECT * FROM duty_checkins WHERE shift_id = ? ORDER BY checkin_time
    `, [shift.id]);
    
    res.json({
      success: true,
      data: {
        shift,
        has_checkin: hasCheckin,
        checkins
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

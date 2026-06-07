const express = require('express');
const router = express.Router();
const { query, queryOne, execute } = require('../db');
const { processWaterLevelAlert } = require('../middleware/businessRules');

router.post('/', async (req, res, next) => {
  try {
    const { station_id, reporter, water_level, rainfall, remarks } = req.body;
    
    if (!station_id || !reporter || water_level === undefined) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：station_id, reporter, water_level'
      });
    }
    
    const station = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [station_id]);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: '泵站不存在'
      });
    }
    
    const isOverWarning = water_level > station.warning_level;
    
    const result = await execute(`
      INSERT INTO water_level_reports (station_id, reporter, water_level, rainfall, is_over_warning, remarks)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [station_id, reporter, water_level, rainfall || 0, isOverWarning ? 1 : 0, remarks || '']);
    
    const report = await queryOne('SELECT * FROM water_level_reports WHERE id = ?', [result.lastID]);
    
    const alert = await processWaterLevelAlert(station_id, water_level);
    
    res.json({
      success: true,
      data: {
        report,
        alert_generated: alert !== null,
        alert
      },
      message: isOverWarning 
        ? `水位上报成功！当前水位${water_level}米超过警戒线${station.warning_level}米` 
        : '水位上报成功'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { station_id, start_date, end_date, is_over_warning, page = 1, page_size = 20 } = req.query;
    const offset = (page - 1) * page_size;
    
    let whereClause = [];
    const params = [];
    
    if (station_id) {
      whereClause.push('w.station_id = ?');
      params.push(station_id);
    }
    
    if (start_date) {
      whereClause.push('DATE(w.report_time) >= ?');
      params.push(start_date);
    }
    
    if (end_date) {
      whereClause.push('DATE(w.report_time) <= ?');
      params.push(end_date);
    }
    
    if (is_over_warning !== undefined) {
      whereClause.push('w.is_over_warning = ?');
      params.push(is_over_warning === 'true' || is_over_warning === '1' ? 1 : 0);
    }
    
    const whereSql = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';
    
    const countRow = await queryOne(`
      SELECT COUNT(*) as total FROM water_level_reports w ${whereSql}
    `, params);
    
    const reports = await query(`
      SELECT w.*, s.code as station_code, s.name as station_name, s.warning_level
      FROM water_level_reports w
      LEFT JOIN pumping_stations s ON w.station_id = s.id
      ${whereSql}
      ORDER BY w.report_time DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(page_size), offset]);
    
    res.json({
      success: true,
      data: {
        list: reports,
        total: countRow.total,
        page: parseInt(page),
        page_size: parseInt(page_size)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/latest/:station_id', async (req, res, next) => {
  try {
    const station = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [req.params.station_id]);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: '泵站不存在'
      });
    }
    
    const latest = await queryOne(`
      SELECT w.*, s.warning_level
      FROM water_level_reports w
      LEFT JOIN pumping_stations s ON w.station_id = s.id
      WHERE w.station_id = ?
      ORDER BY w.report_time DESC
      LIMIT 1
    `, [req.params.station_id]);
    
    res.json({
      success: true,
      data: latest || null
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const report = await queryOne(`
      SELECT w.*, s.code as station_code, s.name as station_name, s.warning_level
      FROM water_level_reports w
      LEFT JOIN pumping_stations s ON w.station_id = s.id
      WHERE w.id = ?
    `, [req.params.id]);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: '水位记录不存在'
      });
    }
    
    res.json({
      success: true,
      data: report
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { query, queryOne, execute } = require('../db');
const { validatePumpOperation } = require('../middleware/businessRules');

router.post('/', validatePumpOperation(), async (req, res, next) => {
  try {
    const { station_id, pump_number, operator_name, operation_type, 
            start_level, end_level, duration, remarks } = req.body;
    
    if (!station_id || !pump_number || !operator_name || !operation_type) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：station_id, pump_number, operator_name, operation_type'
      });
    }
    
    const station = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [station_id]);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: '泵站不存在'
      });
    }
    
    if (pump_number < 1 || pump_number > station.pump_count) {
      return res.status(400).json({
        success: false,
        message: `泵号无效，该泵站只有 ${station.pump_count} 台泵`
      });
    }
    
    if (!['start', 'stop'].includes(operation_type)) {
      return res.status(400).json({
        success: false,
        message: 'operation_type 必须是 start 或 stop'
      });
    }
    
    const shift = req.shift;
    
    const result = await execute(`
      INSERT INTO pump_operations (station_id, shift_id, operator_name, pump_number, 
                                   operation_type, start_level, end_level, duration, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [station_id, shift.id, operator_name, pump_number, operation_type, 
         start_level || null, end_level || null, duration || null, remarks || '']);
    
    const operation = await queryOne('SELECT * FROM pump_operations WHERE id = ?', [result.lastID]);
    
    if (operation_type === 'start') {
      await execute(`
        UPDATE alerts 
        SET status = 'auto_resolved', 
            handled_at = CURRENT_TIMESTAMP,
            handle_notes = COALESCE(handle_notes, '') || ' 已自动开泵处理'
        WHERE station_id = ? AND alert_type = 'water_level_over_no_pump' AND status = 'pending'
      `, [station_id]);
    }
    
    res.json({
      success: true,
      data: operation,
      message: operation_type === 'start' ? '开泵确认成功' : '停泵确认成功'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { station_id, shift_id, operation_type, start_date, end_date, page = 1, page_size = 20 } = req.query;
    const offset = (page - 1) * page_size;
    
    let whereClause = [];
    const params = [];
    
    if (station_id) {
      whereClause.push('o.station_id = ?');
      params.push(station_id);
    }
    
    if (shift_id) {
      whereClause.push('o.shift_id = ?');
      params.push(shift_id);
    }
    
    if (operation_type) {
      whereClause.push('o.operation_type = ?');
      params.push(operation_type);
    }
    
    if (start_date) {
      whereClause.push('DATE(o.operation_time) >= ?');
      params.push(start_date);
    }
    
    if (end_date) {
      whereClause.push('DATE(o.operation_time) <= ?');
      params.push(end_date);
    }
    
    const whereSql = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';
    
    const countRow = await queryOne(`
      SELECT COUNT(*) as total FROM pump_operations o ${whereSql}
    `, params);
    
    const operations = await query(`
      SELECT o.*, s.code as station_code, s.name as station_name,
             sh.shift_date, sh.shift_type
      FROM pump_operations o
      LEFT JOIN pumping_stations s ON o.station_id = s.id
      LEFT JOIN duty_shifts sh ON o.shift_id = sh.id
      ${whereSql}
      ORDER BY o.operation_time DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(page_size), offset]);
    
    res.json({
      success: true,
      data: {
        list: operations,
        total: countRow.total,
        page: parseInt(page),
        page_size: parseInt(page_size)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const operation = await queryOne(`
      SELECT o.*, s.code as station_code, s.name as station_name,
             sh.shift_date, sh.shift_type
      FROM pump_operations o
      LEFT JOIN pumping_stations s ON o.station_id = s.id
      LEFT JOIN duty_shifts sh ON o.shift_id = sh.id
      WHERE o.id = ?
    `, [req.params.id]);
    
    if (!operation) {
      return res.status(404).json({
        success: false,
        message: '开泵记录不存在'
      });
    }
    
    res.json({
      success: true,
      data: operation
    });
  } catch (err) {
    next(err);
  }
});

router.get('/station/:station_id/today', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const operations = await query(`
      SELECT o.*, s.code as station_code, s.name as station_name,
             sh.shift_date, sh.shift_type
      FROM pump_operations o
      LEFT JOIN pumping_stations s ON o.station_id = s.id
      LEFT JOIN duty_shifts sh ON o.shift_id = sh.id
      WHERE o.station_id = ? AND DATE(o.operation_time) = ?
      ORDER BY o.operation_time DESC
    `, [req.params.station_id, today]);
    
    res.json({
      success: true,
      data: operations
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

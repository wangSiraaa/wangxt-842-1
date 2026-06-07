const express = require('express');
const router = express.Router();
const { query, queryOne, execute } = require('../db');

router.post('/', async (req, res, next) => {
  try {
    const { station_id, pump_number, reporter, fault_type, fault_level, description } = req.body;
    
    if (!station_id || !pump_number || !reporter || !fault_type) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：station_id, pump_number, reporter, fault_type'
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
    
    const unresolvedCount = await queryOne(`
      SELECT COUNT(*) as count FROM pump_faults 
      WHERE station_id = ? AND pump_number = ? AND repair_status != 'resolved'
    `, [station_id, pump_number]);
    
    if (unresolvedCount.count > 0) {
      return res.status(400).json({
        success: false,
        message: `第${pump_number}号泵存在未处理的故障，请先处理`
      });
    }
    
    const result = await execute(`
      INSERT INTO pump_faults (station_id, pump_number, reporter, fault_type, fault_level, fault_description)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [station_id, pump_number, reporter, fault_type, fault_level || 'medium', description || '']);
    
    const fault = await queryOne('SELECT * FROM pump_faults WHERE id = ?', [result.lastID]);
    
    res.json({
      success: true,
      data: fault,
      message: '故障上报成功'
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/resolve', async (req, res, next) => {
  try {
    const { resolver, repair_notes } = req.body;
    
    if (!resolver) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：resolver'
      });
    }
    
    const fault = await queryOne('SELECT * FROM pump_faults WHERE id = ?', [req.params.id]);
    if (!fault) {
      return res.status(404).json({
        success: false,
        message: '故障记录不存在'
      });
    }
    
    if (fault.repair_status === 'resolved') {
      return res.status(400).json({
        success: false,
        message: '该故障已解除，无需重复操作'
      });
    }
    
    await execute(`
      UPDATE pump_faults 
      SET repair_status = 'resolved',
          repair_time = CURRENT_TIMESTAMP,
          repairer = ?,
          repair_notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [resolver, repair_notes || '', req.params.id]);
    
    const updated = await queryOne('SELECT * FROM pump_faults WHERE id = ?', [req.params.id]);
    
    res.json({
      success: true,
      data: updated,
      message: '故障解除成功'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { station_id, pump_number, repair_status, fault_level, page = 1, page_size = 20 } = req.query;
    const offset = (page - 1) * page_size;
    
    let whereClause = [];
    const params = [];
    
    if (station_id) {
      whereClause.push('f.station_id = ?');
      params.push(station_id);
    }
    
    if (pump_number) {
      whereClause.push('f.pump_number = ?');
      params.push(pump_number);
    }
    
    if (repair_status) {
      whereClause.push('f.repair_status = ?');
      params.push(repair_status);
    }
    
    if (fault_level) {
      whereClause.push('f.fault_level = ?');
      params.push(fault_level);
    }
    
    const whereSql = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';
    
    const countRow = await queryOne(`
      SELECT COUNT(*) as total FROM pump_faults f ${whereSql}
    `, params);
    
    const faults = await query(`
      SELECT f.*, s.code as station_code, s.name as station_name
      FROM pump_faults f
      LEFT JOIN pumping_stations s ON f.station_id = s.id
      ${whereSql}
      ORDER BY f.report_time DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(page_size), offset]);
    
    res.json({
      success: true,
      data: {
        list: faults,
        total: countRow.total,
        page: parseInt(page),
        page_size: parseInt(page_size)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/station/:station_id/unresolved', async (req, res, next) => {
  try {
    const faults = await query(`
      SELECT f.*, s.code as station_code, s.name as station_name
      FROM pump_faults f
      LEFT JOIN pumping_stations s ON f.station_id = s.id
      WHERE f.station_id = ? AND f.repair_status != 'resolved'
      ORDER BY f.report_time DESC
    `, [req.params.station_id]);
    
    res.json({
      success: true,
      data: faults
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const fault = await queryOne(`
      SELECT f.*, s.code as station_code, s.name as station_name
      FROM pump_faults f
      LEFT JOIN pumping_stations s ON f.station_id = s.id
      WHERE f.id = ?
    `, [req.params.id]);
    
    if (!fault) {
      return res.status(404).json({
        success: false,
        message: '故障记录不存在'
      });
    }
    
    res.json({
      success: true,
      data: fault
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

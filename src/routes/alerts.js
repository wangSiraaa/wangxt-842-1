const express = require('express');
const router = express.Router();
const { query, queryOne, execute } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { station_id, alert_type, alert_level, status, start_date, end_date, page = 1, page_size = 20 } = req.query;
    const offset = (page - 1) * page_size;
    
    let whereClause = [];
    const params = [];
    
    if (station_id) {
      whereClause.push('a.station_id = ?');
      params.push(station_id);
    }
    
    if (alert_type) {
      whereClause.push('a.alert_type = ?');
      params.push(alert_type);
    }
    
    if (alert_level) {
      whereClause.push('a.alert_level = ?');
      params.push(alert_level);
    }
    
    if (status) {
      whereClause.push('a.status = ?');
      params.push(status);
    }
    
    if (start_date) {
      whereClause.push('DATE(a.triggered_at) >= ?');
      params.push(start_date);
    }
    
    if (end_date) {
      whereClause.push('DATE(a.triggered_at) <= ?');
      params.push(end_date);
    }
    
    const whereSql = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';
    
    const countRow = await queryOne(`
      SELECT COUNT(*) as total FROM alerts a ${whereSql}
    `, params);
    
    const alerts = await query(`
      SELECT a.*, s.code as station_code, s.name as station_name
      FROM alerts a
      LEFT JOIN pumping_stations s ON a.station_id = s.id
      ${whereSql}
      ORDER BY a.triggered_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(page_size), offset]);
    
    res.json({
      success: true,
      data: {
        list: alerts,
        total: countRow.total,
        page: parseInt(page),
        page_size: parseInt(page_size)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/pending', async (req, res, next) => {
  try {
    const { station_id } = req.query;
    
    let whereClause = ['a.status = ?'];
    const params = ['pending'];
    
    if (station_id) {
      whereClause.push('a.station_id = ?');
      params.push(station_id);
    }
    
    const whereSql = `WHERE ${whereClause.join(' AND ')}`;
    
    const alerts = await query(`
      SELECT a.*, s.code as station_code, s.name as station_name
      FROM alerts a
      LEFT JOIN pumping_stations s ON a.station_id = s.id
      ${whereSql}
      ORDER BY a.triggered_at DESC
    `, params);
    
    const criticalCount = alerts.filter(a => a.alert_level === 'critical').length;
    const warningCount = alerts.filter(a => a.alert_level === 'warning').length;
    
    res.json({
      success: true,
      data: {
        list: alerts,
        total: alerts.length,
        critical_count: criticalCount,
        warning_count: warningCount
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/statistics', async (req, res, next) => {
  try {
    const { start_date, end_date, station_id } = req.query;
    
    let whereClause = [];
    const params = [];
    
    if (start_date) {
      whereClause.push('DATE(a.triggered_at) >= ?');
      params.push(start_date);
    }
    
    if (end_date) {
      whereClause.push('DATE(a.triggered_at) <= ?');
      params.push(end_date);
    }
    
    if (station_id) {
      whereClause.push('a.station_id = ?');
      params.push(station_id);
    }
    
    const whereSql = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';
    
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'handled' THEN 1 ELSE 0 END) as handled,
        SUM(CASE WHEN status = 'auto_resolved' THEN 1 ELSE 0 END) as auto_resolved,
        SUM(CASE WHEN alert_level = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN alert_level = 'warning' THEN 1 ELSE 0 END) as warning
      FROM alerts a
      ${whereSql}
    `, params);
    
    const typeStats = await query(`
      SELECT alert_type, COUNT(*) as count
      FROM alerts a
      ${whereSql}
      GROUP BY alert_type
    `, params);
    
    res.json({
      success: true,
      data: {
        overview: {
          total: stats.total || 0,
          pending: stats.pending || 0,
          handled: stats.handled || 0,
          auto_resolved: stats.auto_resolved || 0,
          critical: stats.critical || 0,
          warning: stats.warning || 0
        },
        by_type: typeStats
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const alert = await queryOne(`
      SELECT a.*, s.code as station_code, s.name as station_name,
             s.location as station_location, s.warning_level
      FROM alerts a
      LEFT JOIN pumping_stations s ON a.station_id = s.id
      WHERE a.id = ?
    `, [req.params.id]);
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: '告警不存在'
      });
    }
    
    res.json({
      success: true,
      data: alert
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/handle', async (req, res, next) => {
  try {
    const { handled_by, handle_notes, new_status } = req.body;
    
    if (!handled_by) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：handled_by'
      });
    }
    
    const alert = await queryOne('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: '告警不存在'
      });
    }
    
    if (alert.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: '该告警已处理，不能重复处理'
      });
    }
    
    const status = new_status || 'handled';
    
    await execute(`
      UPDATE alerts 
      SET status = ?,
          handled_at = CURRENT_TIMESTAMP,
          handled_by = ?,
          handle_notes = ?
      WHERE id = ?
    `, [status, handled_by, handle_notes || '', req.params.id]);
    
    const updated = await queryOne(`
      SELECT a.*, s.code as station_code, s.name as station_name
      FROM alerts a
      LEFT JOIN pumping_stations s ON a.station_id = s.id
      WHERE a.id = ?
    `, [req.params.id]);
    
    res.json({
      success: true,
      data: updated,
      message: '告警处理成功'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { query, queryOne, execute } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, page = 1, page_size = 20 } = req.query;
    const offset = (page - 1) * page_size;
    
    let whereClause = '';
    const params = [];
    
    if (status) {
      whereClause = 'WHERE status = ?';
      params.push(status);
    }
    
    const countRow = await queryOne(`
      SELECT COUNT(*) as total FROM pumping_stations ${whereClause}
    `, params);
    
    const stations = await query(`
      SELECT * FROM pumping_stations ${whereClause}
      ORDER BY code LIMIT ? OFFSET ?
    `, [...params, parseInt(page_size), offset]);
    
    res.json({
      success: true,
      data: {
        list: stations,
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
    const station = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [req.params.id]);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        message: '泵站不存在'
      });
    }
    
    res.json({
      success: true,
      data: station
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { code, name, location, warning_level, design_flow, pump_count } = req.body;
    
    if (!code || !name || !warning_level) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数：code, name, warning_level'
      });
    }
    
    const existing = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [code]);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: '泵站编码已存在'
      });
    }
    
    await execute(`
      INSERT INTO pumping_stations (id, code, name, location, warning_level, design_flow, pump_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [code, code, name, location || '', warning_level, design_flow || 0, pump_count || 1]);
    
    const station = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [code]);
    
    res.json({
      success: true,
      data: station,
      message: '泵站创建成功'
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, location, warning_level, design_flow, pump_count, status } = req.body;
    
    const station = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [req.params.id]);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: '泵站不存在'
      });
    }
    
    await execute(`
      UPDATE pumping_stations 
      SET name = COALESCE(?, name),
          location = COALESCE(?, location),
          warning_level = COALESCE(?, warning_level),
          design_flow = COALESCE(?, design_flow),
          pump_count = COALESCE(?, pump_count),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, location, warning_level, design_flow, pump_count, status, req.params.id]);
    
    const updated = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [req.params.id]);
    
    res.json({
      success: true,
      data: updated,
      message: '泵站更新成功'
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const station = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [req.params.id]);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: '泵站不存在'
      });
    }
    
    await execute('DELETE FROM pumping_stations WHERE id = ?', [req.params.id]);
    
    res.json({
      success: true,
      message: '泵站删除成功'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

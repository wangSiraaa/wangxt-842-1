const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../db');
const moment = require('moment');

router.get('/overview', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;

    let dateWhere = '';
    const dateParams = [];
    
    if (start_date) {
      dateWhere += ' AND DATE(created_at) >= ?';
      dateParams.push(start_date);
    }
    if (end_date) {
      dateWhere += ' AND DATE(created_at) <= ?';
      dateParams.push(end_date);
    }

    const stationsTotal = await queryOne('SELECT COUNT(*) as count FROM pumping_stations');
    const stationsNormal = await queryOne("SELECT COUNT(*) as count FROM pumping_stations WHERE status = 'normal'");

    const pendingAlerts = await queryOne("SELECT COUNT(*) as count FROM alerts WHERE status = 'pending'");
    const pendingFaults = await queryOne("SELECT COUNT(*) as count FROM pump_faults WHERE repair_status != 'resolved'");

    const today = moment().format('YYYY-MM-DD');
    const todayCheckins = await queryOne('SELECT COUNT(*) as count FROM duty_checkins WHERE DATE(checkin_time) = ?', [today]);
    const todayWaterLevels = await queryOne('SELECT COUNT(*) as count FROM water_level_reports WHERE DATE(report_time) = ?', [today]);
    const todayOperations = await queryOne('SELECT COUNT(*) as count FROM pump_operations WHERE DATE(operation_time) = ?', [today]);

    const totalCheckins = await queryOne(`SELECT COUNT(*) as count FROM duty_checkins WHERE 1=1 ${dateWhere}`, dateParams);
    const totalWaterLevels = await queryOne(`SELECT COUNT(*) as count FROM water_level_reports WHERE 1=1 ${dateWhere}`, dateParams);
    const totalOperations = await queryOne(`SELECT COUNT(*) as count FROM pump_operations WHERE 1=1 ${dateWhere}`, dateParams);
    const totalFaults = await queryOne(`SELECT COUNT(*) as count FROM pump_faults WHERE 1=1 ${dateWhere}`, dateParams);
    const totalAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE 1=1 ${dateWhere}`, dateParams);

    const criticalAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE alert_level = 'critical' AND status = 'pending'`);
    const warningAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE alert_level = 'warning' AND status = 'pending'`);

    const highFaults = await queryOne(`SELECT COUNT(*) as count FROM pump_faults WHERE fault_level = 'high' AND repair_status != 'resolved'`);
    const mediumFaults = await queryOne(`SELECT COUNT(*) as count FROM pump_faults WHERE fault_level = 'medium' AND repair_status != 'resolved'`);

    const overWarningLevels = await queryOne(`SELECT COUNT(*) as count FROM water_level_reports WHERE is_over_warning = 1 ${dateWhere}`, dateParams);

    const noPumpAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE alert_type = 'water_level_over_no_pump' AND status = 'pending'`);

    res.json({
      success: true,
      data: {
        stations: {
          total: stationsTotal.count,
          normal: stationsNormal.count,
          abnormal: stationsTotal.count - stationsNormal.count
        },
        pending: {
          total: pendingAlerts.count + pendingFaults.count,
          alerts: pendingAlerts.count,
          faults: pendingFaults.count,
          alerts_by_level: {
            critical: criticalAlerts.count,
            warning: warningAlerts.count
          },
          faults_by_level: {
            high: highFaults.count,
            medium: mediumFaults.count
          },
          water_level_over_no_pump: noPumpAlerts.count
        },
        today: {
          checkins: todayCheckins.count,
          water_level_reports: todayWaterLevels.count,
          pump_operations: todayOperations.count
        },
        total: {
          checkins: totalCheckins.count,
          water_level_reports: totalWaterLevels.count,
          pump_operations: totalOperations.count,
          faults: totalFaults.count,
          alerts: totalAlerts.count,
          over_warning_levels: overWarningLevels.count
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/by-station', async (req, res, next) => {
  try {
    const { start_date, end_date, station_id } = req.query;

    let stationWhere = '';
    const params = [];
    
    if (station_id) {
      stationWhere = 'WHERE s.id = ?';
      params.push(station_id);
    }

    let dateWhere = '';
    const dateParams = [];
    
    if (start_date) {
      dateWhere += ' AND DATE(created_at) >= ?';
      dateParams.push(start_date);
    }
    if (end_date) {
      dateWhere += ' AND DATE(created_at) <= ?';
      dateParams.push(end_date);
    }

    let opDateWhere = '';
    const opDateParams = [];
    if (start_date) {
      opDateWhere += ' AND DATE(operation_time) >= ?';
      opDateParams.push(start_date);
    }
    if (end_date) {
      opDateWhere += ' AND DATE(operation_time) <= ?';
      opDateParams.push(end_date);
    }

    let wlDateWhere = '';
    const wlDateParams = [];
    if (start_date) {
      wlDateWhere += ' AND DATE(report_time) >= ?';
      wlDateParams.push(start_date);
    }
    if (end_date) {
      wlDateWhere += ' AND DATE(report_time) <= ?';
      wlDateParams.push(end_date);
    }

    let ciDateWhere = '';
    const ciDateParams = [];
    if (start_date) {
      ciDateWhere += ' AND DATE(checkin_time) >= ?';
      ciDateParams.push(start_date);
    }
    if (end_date) {
      ciDateWhere += ' AND DATE(checkin_time) <= ?';
      ciDateParams.push(end_date);
    }

    const stations = await query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM alerts a WHERE a.station_id = s.id AND a.status = 'pending') as pending_alerts,
        (SELECT COUNT(*) FROM pump_faults f WHERE f.station_id = s.id AND f.repair_status != 'resolved') as pending_faults,
        (SELECT COUNT(*) FROM alerts a WHERE a.station_id = s.id AND a.status = 'pending' AND a.alert_type = 'water_level_over_no_pump') as pending_no_pump_alerts,
        (SELECT COUNT(*) FROM duty_checkins c WHERE c.station_id = s.id ${ciDateWhere}) as total_checkins,
        (SELECT COUNT(*) FROM water_level_reports w WHERE w.station_id = s.id ${wlDateWhere}) as total_water_levels,
        (SELECT COUNT(*) FROM water_level_reports w WHERE w.station_id = s.id AND w.is_over_warning = 1 ${wlDateWhere}) as over_warning_levels,
        (SELECT COUNT(*) FROM pump_operations o WHERE o.station_id = s.id ${opDateWhere}) as total_operations,
        (SELECT COUNT(*) FROM pump_operations o WHERE o.station_id = s.id AND o.operation_type = 'start' ${opDateWhere}) as start_operations,
        (SELECT COUNT(*) FROM pump_operations o WHERE o.station_id = s.id AND o.operation_type = 'stop' ${opDateWhere}) as stop_operations,
        (SELECT COUNT(*) FROM pump_faults f WHERE f.station_id = s.id ${dateWhere}) as total_faults,
        (SELECT COUNT(*) FROM alerts a WHERE a.station_id = s.id ${dateWhere}) as total_alerts
      FROM pumping_stations s
      ${stationWhere}
      ORDER BY s.code
    `, [...params, ...ciDateParams, ...wlDateParams, ...wlDateParams, ...opDateParams, ...opDateParams, ...opDateParams, ...dateParams, ...dateParams]);

    res.json({
      success: true,
      data: {
        list: stations,
        total: stations.length
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/station/:station_id', async (req, res, next) => {
  try {
    const stationId = req.params.station_id;
    const { start_date, end_date } = req.query;

    const station = await queryOne('SELECT * FROM pumping_stations WHERE id = ?', [stationId]);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: '泵站不存在'
      });
    }

    let dateWhere = '';
    const dateParams = [];
    
    if (start_date) {
      dateWhere += ' AND DATE(created_at) >= ?';
      dateParams.push(start_date);
    }
    if (end_date) {
      dateWhere += ' AND DATE(created_at) <= ?';
      dateParams.push(end_date);
    }

    let opDateWhere = '';
    const opDateParams = [];
    if (start_date) {
      opDateWhere += ' AND DATE(operation_time) >= ?';
      opDateParams.push(start_date);
    }
    if (end_date) {
      opDateWhere += ' AND DATE(operation_time) <= ?';
      opDateParams.push(end_date);
    }

    let wlDateWhere = '';
    const wlDateParams = [];
    if (start_date) {
      wlDateWhere += ' AND DATE(report_time) >= ?';
      wlDateParams.push(start_date);
    }
    if (end_date) {
      wlDateWhere += ' AND DATE(report_time) <= ?';
      wlDateParams.push(end_date);
    }

    let ciDateWhere = '';
    const ciDateParams = [];
    if (start_date) {
      ciDateWhere += ' AND DATE(checkin_time) >= ?';
      ciDateParams.push(start_date);
    }
    if (end_date) {
      ciDateWhere += ' AND DATE(checkin_time) <= ?';
      ciDateParams.push(end_date);
    }

    const pendingAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE station_id = ? AND status = 'pending'`, [stationId]);
    const pendingFaults = await queryOne(`SELECT COUNT(*) as count FROM pump_faults WHERE station_id = ? AND repair_status != 'resolved'`, [stationId]);
    const pendingNoPumpAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE station_id = ? AND alert_type = 'water_level_over_no_pump' AND status = 'pending'`, [stationId]);

    const totalCheckins = await queryOne(`SELECT COUNT(*) as count FROM duty_checkins WHERE station_id = ? ${ciDateWhere}`, [stationId, ...ciDateParams]);
    const totalWaterLevels = await queryOne(`SELECT COUNT(*) as count FROM water_level_reports WHERE station_id = ? ${wlDateWhere}`, [stationId, ...wlDateParams]);
    const totalOperations = await queryOne(`SELECT COUNT(*) as count FROM pump_operations WHERE station_id = ? ${opDateWhere}`, [stationId, ...opDateParams]);
    const totalFaults = await queryOne(`SELECT COUNT(*) as count FROM pump_faults WHERE station_id = ? ${dateWhere}`, [stationId, ...dateParams]);
    const totalAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE station_id = ? ${dateWhere}`, [stationId, ...dateParams]);

    const overWarningLevels = await queryOne(`SELECT COUNT(*) as count FROM water_level_reports WHERE station_id = ? AND is_over_warning = 1 ${wlDateWhere}`, [stationId, ...wlDateParams]);
    const startOperations = await queryOne(`SELECT COUNT(*) as count FROM pump_operations WHERE station_id = ? AND operation_type = 'start' ${opDateWhere}`, [stationId, ...opDateParams]);
    const stopOperations = await queryOne(`SELECT COUNT(*) as count FROM pump_operations WHERE station_id = ? AND operation_type = 'stop' ${opDateWhere}`, [stationId, ...opDateParams]);

    const criticalAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE station_id = ? AND alert_level = 'critical' AND status = 'pending'`, [stationId]);
    const warningAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE station_id = ? AND alert_level = 'warning' AND status = 'pending'`, [stationId]);
    const highFaults = await queryOne(`SELECT COUNT(*) as count FROM pump_faults WHERE station_id = ? AND fault_level = 'high' AND repair_status != 'resolved'`, [stationId]);
    const mediumFaults = await queryOne(`SELECT COUNT(*) as count FROM pump_faults WHERE station_id = ? AND fault_level = 'medium' AND repair_status != 'resolved'`, [stationId]);

    const handledAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE station_id = ? AND status = 'handled' ${dateWhere}`, [stationId, ...dateParams]);
    const autoResolvedAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE station_id = ? AND status = 'auto_resolved' ${dateWhere}`, [stationId, ...dateParams]);
    const resolvedFaults = await queryOne(`SELECT COUNT(*) as count FROM pump_faults WHERE station_id = ? AND repair_status = 'resolved' ${dateWhere}`, [stationId, ...dateParams]);

    const latestWaterLevel = await queryOne(`
      SELECT w.*, s.warning_level
      FROM water_level_reports w
      LEFT JOIN pumping_stations s ON w.station_id = s.id
      WHERE w.station_id = ?
      ORDER BY w.report_time DESC
      LIMIT 1
    `, [stationId]);

    const latestOperation = await queryOne(`
      SELECT o.*
      FROM pump_operations o
      WHERE o.station_id = ?
      ORDER BY o.operation_time DESC
      LIMIT 1
    `, [stationId]);

    const today = moment().format('YYYY-MM-DD');
    const todayCheckins = await queryOne('SELECT COUNT(*) as count FROM duty_checkins WHERE station_id = ? AND DATE(checkin_time) = ?', [stationId, today]);
    const todayWaterLevels = await queryOne('SELECT COUNT(*) as count FROM water_level_reports WHERE station_id = ? AND DATE(report_time) = ?', [stationId, today]);
    const todayOperations = await queryOne('SELECT COUNT(*) as count FROM pump_operations WHERE station_id = ? AND DATE(operation_time) = ?', [stationId, today]);

    const pendingAlertsList = await query(`
      SELECT a.*
      FROM alerts a
      WHERE a.station_id = ? AND a.status = 'pending'
      ORDER BY a.triggered_at DESC
    `, [stationId]);

    const pendingFaultsList = await query(`
      SELECT f.*
      FROM pump_faults f
      WHERE f.station_id = ? AND f.repair_status != 'resolved'
      ORDER BY f.report_time DESC
    `, [stationId]);

    const recentLogs = await query(`
      SELECT * FROM (
        SELECT id, 'checkin' as type, checkin_time as time, operator_name as operator, checkin_type as sub_type, remarks
        FROM duty_checkins WHERE station_id = ? ${ciDateWhere}
        UNION ALL
        SELECT id, 'water_level' as type, report_time as time, reporter as operator, CAST(is_over_warning as TEXT) as sub_type, remarks
        FROM water_level_reports WHERE station_id = ? ${wlDateWhere}
        UNION ALL
        SELECT id, 'pump_operation' as type, operation_time as time, operator_name as operator, operation_type as sub_type, remarks
        FROM pump_operations WHERE station_id = ? ${opDateWhere}
      ) ORDER BY time DESC
      LIMIT 20
    `, [stationId, ...ciDateParams, stationId, ...wlDateParams, stationId, ...opDateParams]);

    res.json({
      success: true,
      data: {
        station,
        latest: {
          water_level: latestWaterLevel,
          operation: latestOperation
        },
        today: {
          checkins: todayCheckins.count,
          water_level_reports: todayWaterLevels.count,
          pump_operations: todayOperations.count
        },
        pending: {
          total: pendingAlerts.count + pendingFaults.count,
          alerts: pendingAlerts.count,
          faults: pendingFaults.count,
          alerts_by_level: {
            critical: criticalAlerts.count,
            warning: warningAlerts.count
          },
          faults_by_level: {
            high: highFaults.count,
            medium: mediumFaults.count
          },
          water_level_over_no_pump: pendingNoPumpAlerts.count,
          alerts_list: pendingAlertsList,
          faults_list: pendingFaultsList
        },
        total: {
          checkins: totalCheckins.count,
          water_level_reports: totalWaterLevels.count,
          over_warning_levels: overWarningLevels.count,
          pump_operations: totalOperations.count,
          start_operations: startOperations.count,
          stop_operations: stopOperations.count,
          faults: totalFaults.count,
          alerts: totalAlerts.count,
          handled_alerts: handledAlerts.count,
          auto_resolved_alerts: autoResolvedAlerts.count,
          resolved_faults: resolvedFaults.count
        },
        recent_logs: recentLogs
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/daily', async (req, res, next) => {
  try {
    const { start_date, end_date, station_id, days = 7 } = req.query;

    let endDate = end_date ? moment(end_date) : moment();
    let startDate = start_date ? moment(start_date) : moment().subtract(parseInt(days) - 1, 'days');

    const dateList = [];
    let current = startDate.clone();
    while (current.isSameOrBefore(endDate)) {
      dateList.push(current.format('YYYY-MM-DD'));
      current.add(1, 'day');
    }

    let stationWhere = '';
    const params = [];
    if (station_id) {
      stationWhere = 'AND station_id = ?';
      params.push(station_id);
    }

    const dailyData = [];
    for (const date of dateList) {
      const checkins = await queryOne(`SELECT COUNT(*) as count FROM duty_checkins WHERE DATE(checkin_time) = ? ${stationWhere}`, [date, ...params]);
      const waterLevels = await queryOne(`SELECT COUNT(*) as count FROM water_level_reports WHERE DATE(report_time) = ? ${stationWhere}`, [date, ...params]);
      const overWarning = await queryOne(`SELECT COUNT(*) as count FROM water_level_reports WHERE DATE(report_time) = ? AND is_over_warning = 1 ${stationWhere}`, [date, ...params]);
      const operations = await queryOne(`SELECT COUNT(*) as count FROM pump_operations WHERE DATE(operation_time) = ? ${stationWhere}`, [date, ...params]);
      const starts = await queryOne(`SELECT COUNT(*) as count FROM pump_operations WHERE DATE(operation_time) = ? AND operation_type = 'start' ${stationWhere}`, [date, ...params]);
      const faults = await queryOne(`SELECT COUNT(*) as count FROM pump_faults WHERE DATE(report_time) = ? ${stationWhere}`, [date, ...params]);
      const alerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE DATE(triggered_at) = ? ${stationWhere}`, [date, ...params]);
      const criticalAlerts = await queryOne(`SELECT COUNT(*) as count FROM alerts WHERE DATE(triggered_at) = ? AND alert_level = 'critical' ${stationWhere}`, [date, ...params]);

      dailyData.push({
        date,
        checkins: checkins.count,
        water_level_reports: waterLevels.count,
        over_warning_levels: overWarning.count,
        pump_operations: operations.count,
        start_operations: starts.count,
        faults: faults.count,
        alerts: alerts.count,
        critical_alerts: criticalAlerts.count
      });
    }

    res.json({
      success: true,
      data: dailyData
    });
  } catch (err) {
    next(err);
  }
});

router.get('/todo-list', async (req, res, next) => {
  try {
    const { station_id } = req.query;

    let stationWhere = 'WHERE 1=1';
    const params = [];
    if (station_id) {
      stationWhere += ' AND a.station_id = ?';
      params.push(station_id);
    }

    let stationWhere2 = 'WHERE 1=1';
    const params2 = [];
    if (station_id) {
      stationWhere2 += ' AND f.station_id = ?';
      params2.push(station_id);
    }

    const pendingAlerts = await query(`
      SELECT a.id, a.station_id, a.alert_type, a.alert_level, a.alert_message, 
             a.water_level, a.threshold_level, a.triggered_at, a.status,
             s.code as station_code, s.name as station_name
      FROM alerts a
      LEFT JOIN pumping_stations s ON a.station_id = s.id
      ${stationWhere} AND a.status = 'pending'
      ORDER BY 
        CASE a.alert_level WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        a.triggered_at DESC
    `, params);

    const pendingFaults = await query(`
      SELECT f.id, f.station_id, f.pump_number, f.fault_type, f.fault_level, 
             f.fault_description, f.report_time, f.repair_status, f.reporter,
             s.code as station_code, s.name as station_name
      FROM pump_faults f
      LEFT JOIN pumping_stations s ON f.station_id = s.id
      ${stationWhere2} AND f.repair_status != 'resolved'
      ORDER BY 
        CASE f.fault_level WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        f.report_time DESC
    `, params2);

    const todoList = [
      ...pendingAlerts.map(a => ({
        id: `alert_${a.id}`,
        type: 'alert',
        priority: a.alert_level === 'critical' ? 'high' : 'medium',
        title: `[${a.station_code}] ${a.alert_message.substring(0, 50)}${a.alert_message.length > 50 ? '...' : ''}`,
        description: a.alert_message,
        station_id: a.station_id,
        station_code: a.station_code,
        station_name: a.station_name,
        created_at: a.triggered_at,
        detail: a
      })),
      ...pendingFaults.map(f => ({
        id: `fault_${f.id}`,
        type: 'fault',
        priority: f.fault_level === 'high' ? 'high' : 'medium',
        title: `[${f.station_code}] ${f.pump_number}号泵故障：${f.fault_type}`,
        description: f.fault_description || '',
        station_id: f.station_id,
        station_code: f.station_code,
        station_name: f.station_name,
        pump_number: f.pump_number,
        created_at: f.report_time,
        detail: f
      }))
    ].sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });

    const highPriority = todoList.filter(t => t.priority === 'high').length;
    const mediumPriority = todoList.filter(t => t.priority === 'medium').length;
    const alertCount = todoList.filter(t => t.type === 'alert').length;
    const faultCount = todoList.filter(t => t.type === 'fault').length;

    res.json({
      success: true,
      data: {
        list: todoList,
        total: todoList.length,
        by_priority: {
          high: highPriority,
          medium: mediumPriority
        },
        by_type: {
          alert: alertCount,
          fault: faultCount
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

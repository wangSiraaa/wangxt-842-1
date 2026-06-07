const axios = require('axios');
const { execute, query } = require('../src/db');

const API_BASE = 'http://localhost:3000/api';

async function clearTestData() {
  console.log('🧹 清理测试数据...');
  
  await execute('DELETE FROM pump_operations WHERE station_id = ?', ['PS001']);
  await execute('DELETE FROM alerts WHERE station_id = ?', ['PS001']);
  await execute('DELETE FROM water_level_reports WHERE station_id = ?', ['PS001']);
  await execute('DELETE FROM pump_faults WHERE station_id = ?', ['PS001']);
  await execute('DELETE FROM duty_checkins WHERE station_id = ?', ['PS001']);
  await execute('DELETE FROM duty_shifts WHERE station_id = ?', ['PS001']);
  
  console.log('✅ 测试数据清理完成\n');
}

async function runScenario() {
  console.log('='.repeat(60));
  console.log('🧪 场景验证：录入超警戒水位后未开泵告警出现');
  console.log('='.repeat(60) + '\n');
  
  const stationId = 'PS001';
  const warningLevel = 3.5;
  const testWaterLevel = 4.0;
  
  console.log(`📍 测试泵站: PS001 - 东城区一号泵站`);
  console.log(`⚠️  警戒水位: ${warningLevel} 米`);
  console.log(`💧 测试水位: ${testWaterLevel} 米 (超过警戒线 ${testWaterLevel - warningLevel} 米)`);
  console.log(`⏱️  开泵窗口: 10分钟内无开泵记录时触发告警\n`);
  
  try {
    await clearTestData();
    
    console.log('📋 步骤1: 查询待处理告警列表（预期：无告警）');
    const pendingBefore = await axios.get(`${API_BASE}/alerts/pending?station_id=${stationId}`);
    console.log(`   待处理告警数量: ${pendingBefore.data.data.total}`);
    if (pendingBefore.data.data.total !== 0) {
      throw new Error('❌ 初始状态下不应有待处理告警');
    }
    console.log('   ✅ 通过：初始状态无待处理告警\n');
    
    console.log('📋 步骤2: 防汛值班员签到');
    const checkinRes = await axios.post(`${API_BASE}/checkin`, {
      station_id: stationId,
      operator_name: '张三',
      checkin_type: 'on_duty',
      remarks: '防汛值班开始'
    });
    console.log(`   签到人: ${checkinRes.data.data.operator_name}`);
    console.log(`   签到时间: ${checkinRes.data.data.checkin_time}`);
    console.log('   ✅ 通过：签到成功\n');
    
    console.log('📋 步骤3: 防汛值班员录入超警戒水位');
    const waterLevelRes = await axios.post(`${API_BASE}/water-level`, {
      station_id: stationId,
      reporter: '张三',
      water_level: testWaterLevel,
      rainfall: 25.5,
      remarks: '强降雨导致水位快速上涨'
    });
    console.log(`   上报水位: ${waterLevelRes.data.data.report.water_level} 米`);
    console.log(`   是否超警戒: ${waterLevelRes.data.data.report.is_over_warning ? '是' : '否'}`);
    console.log(`   是否生成告警: ${waterLevelRes.data.data.alert_generated ? '是' : '否'}`);
    
    if (!waterLevelRes.data.data.alert_generated) {
      throw new Error('❌ 超警戒水位上报后未生成告警');
    }
    console.log('   ✅ 通过：超警戒水位上报成功，告警已生成\n');
    
    console.log('📋 步骤4: 验证告警详情');
    const alert = waterLevelRes.data.data.alert;
    console.log(`   告警ID: ${alert.id}`);
    console.log(`   告警类型: ${alert.alert_type}`);
    console.log(`   告警级别: ${alert.alert_level}`);
    console.log(`   告警消息: ${alert.alert_message}`);
    console.log(`   告警状态: ${alert.status}`);
    
    if (alert.alert_type !== 'water_level_over_no_pump') {
      throw new Error('❌ 告警类型不正确，应为 water_level_over_no_pump');
    }
    if (alert.alert_level !== 'warning' && alert.alert_level !== 'critical') {
      throw new Error('❌ 告警级别不正确');
    }
    if (alert.status !== 'pending') {
      throw new Error('❌ 告警状态应为 pending');
    }
    console.log('   ✅ 通过：告警信息正确\n');
    
    console.log('📋 步骤5: 查询待处理告警列表（预期：1条告警）');
    const pendingAfter = await axios.get(`${API_BASE}/alerts/pending?station_id=${stationId}`);
    console.log(`   待处理告警数量: ${pendingAfter.data.data.total}`);
    console.log(`   严重告警数量: ${pendingAfter.data.data.critical_count}`);
    console.log(`   警告告警数量: ${pendingAfter.data.data.warning_count}`);
    
    if (pendingAfter.data.data.total !== 1) {
      throw new Error('❌ 待处理告警数量应为 1');
    }
    console.log('   ✅ 通过：待处理告警列表正确\n');
    
    console.log('📋 步骤6: 查询告警统计');
    const statsRes = await axios.get(`${API_BASE}/alerts/statistics?station_id=${stationId}`);
    const stats = statsRes.data.data.overview;
    console.log(`   告警总数: ${stats.total}`);
    console.log(`   待处理: ${stats.pending}`);
    console.log(`   已处理: ${stats.handled}`);
    console.log(`   自动解决: ${stats.auto_resolved}`);
    console.log(`   严重级别: ${stats.critical}`);
    console.log(`   警告级别: ${stats.warning}`);
    
    if (stats.total !== 1 || stats.pending !== 1) {
      throw new Error('❌ 告警统计数据不正确');
    }
    console.log('   ✅ 通过：告警统计正确\n');
    
    console.log('📋 步骤7: 泵站司机确认开泵（验证自动解决告警）');
    const pumpRes = await axios.post(`${API_BASE}/pump-operations`, {
      station_id: stationId,
      pump_number: 1,
      operator_name: '李四',
      operation_type: 'start',
      start_level: testWaterLevel,
      duration: 120,
      remarks: '响应高水位告警开泵'
    });
    console.log(`   开泵编号: ${pumpRes.data.data.pump_number}号泵`);
    console.log(`   操作类型: ${pumpRes.data.data.operation_type === 'start' ? '开泵' : '停泵'}`);
    console.log(`   操作人: ${pumpRes.data.data.operator_name}`);
    console.log('   ✅ 通过：开泵确认成功\n');
    
    console.log('📋 步骤8: 验证告警是否自动解决');
    const pendingFinal = await axios.get(`${API_BASE}/alerts/pending?station_id=${stationId}`);
    console.log(`   待处理告警数量: ${pendingFinal.data.data.total}`);
    
    if (pendingFinal.data.data.total !== 0) {
      throw new Error('❌ 开泵后告警应自动解决，待处理数量应为 0');
    }
    
    const allAlerts = await axios.get(`${API_BASE}/alerts?station_id=${stationId}`);
    const latestAlert = allAlerts.data.data.list[0];
    console.log(`   最新告警状态: ${latestAlert.status}`);
    
    if (latestAlert.status !== 'auto_resolved') {
      throw new Error('❌ 告警状态应为 auto_resolved');
    }
    console.log('   ✅ 通过：开泵后告警已自动解决\n');
    
    console.log('📋 步骤9: 验证业务规则 - 无人签到不能开泵');
    console.log('   清理签到数据...');
    await execute('DELETE FROM duty_checkins WHERE station_id = ?', [stationId]);
    await execute('DELETE FROM duty_shifts WHERE station_id = ?', [stationId]);
    
    try {
      await axios.post(`${API_BASE}/pump-operations`, {
        station_id: stationId,
        pump_number: 1,
        operator_name: '李四',
        operation_type: 'start'
      });
      throw new Error('❌ 无人签到时开泵应被拒绝');
    } catch (error) {
      if (error.response && error.response.data.code === 'NO_CHECKIN_FOR_SHIFT') {
        console.log(`   拒绝原因: ${error.response.data.message}`);
        console.log('   ✅ 通过：无人签到时不能开泵\n');
      } else {
        throw error;
      }
    }
    
    console.log('📋 步骤10: 验证业务规则 - 故障泵不能参与调度');
    console.log('   先签到...');
    await axios.post(`${API_BASE}/checkin`, {
      station_id: stationId,
      operator_name: '张三',
      checkin_type: 'on_duty'
    });
    
    console.log('   上报1号泵故障...');
    await axios.post(`${API_BASE}/faults`, {
      station_id: stationId,
      pump_number: 1,
      reporter: '张三',
      fault_type: 'mechanical',
      fault_level: 'high',
      description: '电机异响，需要检修'
    });
    
    try {
      await axios.post(`${API_BASE}/pump-operations`, {
        station_id: stationId,
        pump_number: 1,
        operator_name: '李四',
        operation_type: 'start'
      });
      throw new Error('❌ 故障泵开泵应被拒绝');
    } catch (error) {
      if (error.response && error.response.data.code === 'PUMP_IS_FAULTY') {
        console.log(`   拒绝原因: ${error.response.data.message}`);
        console.log('   ✅ 通过：故障泵不能参与调度\n');
      } else {
        throw error;
      }
    }
    
    console.log('📋 步骤11: 解除故障后验证可以开泵');
    const unresolvedFaults = await axios.get(`${API_BASE}/faults/station/${stationId}/unresolved`);
    const faultId = unresolvedFaults.data.data[0].id;
    
    await axios.put(`${API_BASE}/faults/${faultId}/resolve`, {
      resolver: '王五',
      repair_notes: '更换轴承，故障已排除'
    });
    console.log('   故障已解除');
    
    const pumpRes2 = await axios.post(`${API_BASE}/pump-operations`, {
      station_id: stationId,
      pump_number: 1,
      operator_name: '李四',
      operation_type: 'start'
    });
    console.log(`   开泵结果: ${pumpRes2.data.message}`);
    console.log('   ✅ 通过：故障解除后可以正常开泵\n');
    
    console.log('='.repeat(60));
    console.log('🎉 所有验证场景通过！');
    console.log('='.repeat(60));
    console.log('\n📊 验证总结:');
    console.log('   ✅ 超警戒水位未开泵 → 生成告警');
    console.log('   ✅ 开泵后 → 告警自动解决');
    console.log('   ✅ 无人签到 → 拒绝开泵');
    console.log('   ✅ 泵有故障 → 拒绝开泵');
    console.log('   ✅ 故障解除 → 允许开泵');
    console.log('   ✅ 告警统计正确');
    console.log('   ✅ 待处理告警查询正确');
    
  } catch (error) {
    console.error('\n❌ 验证失败:', error.message);
    if (error.response) {
      console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  } finally {
    await clearTestData();
  }
}

runScenario();

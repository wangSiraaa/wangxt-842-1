const express = require('express');
const cors = require('cors');
const path = require('path');

const stationsRoutes = require('./src/routes/stations');
const checkinRoutes = require('./src/routes/checkin');
const waterLevelRoutes = require('./src/routes/waterLevel');
const pumpOperationRoutes = require('./src/routes/pumpOperation');
const faultsRoutes = require('./src/routes/faults');
const alertsRoutes = require('./src/routes/alerts');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.json({
    name: '城市内涝泵站值守 API 服务',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      stations: '/api/stations',
      checkin: '/api/checkin',
      waterLevel: '/api/water-level',
      pumpOperation: '/api/pump-operations',
      faults: '/api/faults',
      alerts: '/api/alerts'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/stations', stationsRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/water-level', waterLevelRoutes);
app.use('/api/pump-operations', pumpOperationRoutes);
app.use('/api/faults', faultsRoutes);
app.use('/api/alerts', alertsRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: err.message || '服务器内部错误'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 城市内涝泵站值守 API 服务已启动`);
    console.log(`📍 服务地址: http://localhost:${PORT}`);
    console.log(`📚 API 文档: http://localhost:${PORT}/`);
    console.log(`\n📌 预置泵站数据:`);
    console.log(`   PS001 - 东城区一号泵站 (警戒线: 3.5米)`);
    console.log(`   PS002 - 西城区二号泵站 (警戒线: 3.2米)`);
    console.log(`   PS003 - 南城区三号泵站 (警戒线: 3.8米)`);
    console.log(`   PS004 - 北城区四号泵站 (警戒线: 3.0米)`);
    console.log(`\n🧪 运行测试: npm run test-alert`);
  });
}

module.exports = app;

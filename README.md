# 城市内涝泵站值守 API 服务

城市内涝泵站值守后端 API 服务，支持泵站档案管理、值守签到、水位雨量上报、开泵调度、故障处理和告警查询。

## 技术栈

- Node.js + Express
- SQLite (better-sqlite3)
- Moment.js

## 启动步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

```bash
npm run init-db
```

初始化后会在 `data/` 目录下创建 `pumping_station.db` 数据库文件，并预置 4 个泵站档案。

### 3. 启动服务

```bash
npm start
```

服务默认运行在 `http://localhost:3000`

开发模式（自动重启）：

```bash
npm run dev
```

### 4. 健康检查

```bash
curl http://localhost:3000/api/health
```

## 业务规则（服务端强制校验）

1. **超警戒水位未开泵告警**：水位超过警戒线且 10 分钟内无开泵记录时，自动生成告警
2. **无人签到不能开泵**：当前班次无签到记录时，不能确认开泵运行
3. **故障泵不能调度**：存在未处理故障的泵，不能参与开泵调度

## API 接口列表

### 泵站档案管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/stations | 泵站列表 |
| POST | /api/stations | 新增泵站 |
| GET | /api/stations/:id | 泵站详情 |
| PUT | /api/stations/:id | 更新泵站 |
| DELETE | /api/stations/:id | 删除泵站 |

### 值守签到

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/checkin | 值班员签到 |
| GET | /api/checkin | 签到记录列表 |
| GET | /api/checkin/today/:station_id | 今日签到状态 |

### 水位上报

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/water-level | 上报水位雨量 |
| GET | /api/water-level | 水位记录列表 |
| GET | /api/water-level/latest/:station_id | 最新水位 |

### 开泵调度

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/pump-operations | 确认开泵/停泵 |
| GET | /api/pump-operations | 开泵记录列表 |
| GET | /api/pump-operations/:id | 开泵记录详情 |
| GET | /api/pump-operations/station/:id/today | 今日开泵记录 |

### 故障处理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/faults | 上报故障 |
| PUT | /api/faults/:id/resolve | 解除故障 |
| GET | /api/faults | 故障记录列表 |
| GET | /api/faults/station/:id/pending | 未处理故障 |

### 告警查询

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/alerts | 告警列表 |
| GET | /api/alerts/pending | 待处理告警 |
| GET | /api/alerts/:id | 告警详情 |
| PUT | /api/alerts/:id/handle | 处理告警 |
| GET | /api/alerts/statistics/summary | 告警统计 |

## 示例请求

### 1. 查询泵站列表

```bash
curl http://localhost:3000/api/stations
```

### 2. 值班员签到

```bash
curl -X POST http://localhost:3000/api/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "station_id": 1,
    "operator_name": "张三",
    "checkin_type": "on_duty",
    "remarks": "白班接班"
  }'
```

### 3. 上报水位（超警戒水位，将触发告警）

```bash
curl -X POST http://localhost:3000/api/water-level \
  -H "Content-Type: application/json" \
  -d '{
    "station_id": 1,
    "reporter": "李四",
    "water_level": 4.0,
    "rainfall": 50.5,
    "remarks": "暴雨红色预警"
  }'
```

> PS001 号泵站警戒线为 3.5 米，上报 4.0 米将超过警戒线，如果 10 分钟内无开泵记录，会自动生成告警。

### 4. 确认开泵

```bash
curl -X POST http://localhost:3000/api/pump-operations \
  -H "Content-Type: application/json" \
  -d '{
    "station_id": 1,
    "pump_number": 1,
    "operator_name": "王五",
    "operation_type": "start",
    "start_level": 4.0,
    "remarks": "应急开泵"
  }'
```

### 5. 查询待处理告警

```bash
curl http://localhost:3000/api/alerts/pending
```

### 6. 处理告警

```bash
curl -X PUT http://localhost:3000/api/alerts/1/handle \
  -H "Content-Type: application/json" \
  -d '{
    "handler": "赵六",
    "handle_notes": "已通知现场人员开泵",
    "status": "handled"
  }'
```

### 7. 上报故障

```bash
curl -X POST http://localhost:3000/api/faults \
  -H "Content-Type: application/json" \
  -d '{
    "station_id": 1,
    "pump_number": 2,
    "fault_type": "mechanical",
    "fault_description": "水泵异响",
    "reporter": "钱七"
  }'
```

## 验证告警场景

运行验证脚本，复现"录入超警戒水位后未开泵告警出现"场景：

```bash
npm run test-alert
```

脚本会自动执行以下步骤：
1. 清理旧数据
2. 确认泵站警戒线（3.5 米）
3. 上报超警戒水位 4.0 米
4. 查询告警列表，验证告警已生成

## 数据库结构

- `pumping_stations` - 泵站档案
- `duty_shifts` - 值班班次
- `duty_checkins` - 签到记录
- `water_level_reports` - 水位上报记录
- `pump_operations` - 开泵记录
- `pump_faults` - 故障记录
- `alerts` - 告警记录

## 项目结构

```
├── server.js                 # 服务入口
├── package.json
├── README.md
├── data/                     # 数据库文件目录
│   └── pumping_station.db
├── src/
│   ├── db/
│   │   ├── index.js         # 数据库连接
│   │   └── init.js          # 数据库初始化脚本
│   ├── middleware/
│   │   └── businessRules.js # 业务规则中间件
│   └── routes/
│       ├── stations.js      # 泵站档案
│       ├── checkin.js       # 值守签到
│       ├── waterLevel.js    # 水位上报
│       ├── pumpOperation.js # 开泵调度
│       ├── faults.js        # 故障处理
│       └── alerts.js        # 告警查询
└── test/
    └── verify-alert-scenario.js
```

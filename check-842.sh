#!/bin/bash

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  城市内涝泵站值守 API 服务 - 统计汇总功能测试${NC}"
echo -e "${BLUE}============================================================${NC}"

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

PORT=30888
API_BASE="http://localhost:${PORT}/api"

echo -e "\n${YELLOW}📍 项目目录: ${PROJECT_DIR}${NC}"
echo -e "${YELLOW}📍 API 地址: ${API_BASE}${NC}"

cleanup() {
  echo -e "\n${YELLOW}🧹 清理测试数据和进程...${NC}"
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f data/pumping_station.db
  echo -e "${GREEN}✅ 清理完成${NC}"
}

trap cleanup EXIT

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤1: 初始化数据库${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

npm run init-db 2>&1 | tail -5

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤2: 启动 API 服务${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

node server.js &
SERVER_PID=$!
echo -e "${YELLOW}🚀 服务进程 PID: ${SERVER_PID}${NC}"

sleep 3

if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo -e "${RED}❌ 服务启动失败${NC}"
  exit 1
fi
echo -e "${GREEN}✅ 服务启动成功${NC}"

API_CALL() {
  local method=$1
  local url=$2
  local data=$3
  
  if [ "$method" = "GET" ]; then
    curl -s -X GET "${API_BASE}${url}" -H "Content-Type: application/json"
  else
    curl -s -X "$method" "${API_BASE}${url}" -H "Content-Type: application/json" -d "$data"
  fi
}

ASSERT_EQUAL() {
  local actual=$1
  local expected=$2
  local message=$3
  
  if [ "$actual" = "$expected" ]; then
    echo -e "   ${GREEN}✅ ${message}${NC}"
    return 0
  else
    echo -e "   ${RED}❌ ${message}${NC}"
    echo -e "      期望: ${expected}, 实际: ${actual}"
    return 1
  fi
}

ASSERT_GREATER() {
  local actual=$1
  local expected=$2
  local message=$3
  
  if [ "$actual" -gt "$expected" ]; then
    echo -e "   ${GREEN}✅ ${message}${NC}"
    return 0
  else
    echo -e "   ${RED}❌ ${message}${NC}"
    echo -e "      期望大于: ${expected}, 实际: ${actual}"
    return 1
  fi
}

PASSED=0
FAILED=0

TEST_CASE() {
  local name=$1
  echo -e "\n${YELLOW}📋 ${name}${NC}"
}

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤3: 测试全局概览统计 - 初始状态${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "获取全局概览统计"
RESPONSE=$(API_CALL GET "/summary/overview")
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")

if [ "$SUCCESS" = "true" ]; then
  STATIONS_TOTAL=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.stations.total)})")
  STATIONS_NORMAL=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.stations.normal)})")
  PENDING_ALERTS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.alerts)})")
  PENDING_FAULTS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.faults)})")
  WATER_LEVEL_NO_PUMP=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.water_level_over_no_pump)})")
  
  ASSERT_EQUAL "$STATIONS_TOTAL" "4" "泵站总数应为 4"
  ASSERT_EQUAL "$STATIONS_NORMAL" "4" "正常泵站数应为 4"
  ASSERT_EQUAL "$PENDING_ALERTS" "0" "初始待处理告警应为 0"
  ASSERT_EQUAL "$PENDING_FAULTS" "0" "初始待处理故障应为 0"
  ASSERT_EQUAL "$WATER_LEVEL_NO_PUMP" "0" "初始水位超警戒未开泵告警应为 0"
  PASSED=$((PASSED + 5))
else
  echo -e "   ${RED}❌ API 调用失败${NC}"
  echo "   $RESPONSE"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤4: 测试按泵站统计${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "获取所有泵站统计"
RESPONSE=$(API_CALL GET "/summary/by-station")
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")

if [ "$SUCCESS" = "true" ]; then
  TOTAL=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.total)})")
  FIRST_STATION=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].code)})")
  PENDING_ALERTS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].pending_alerts)})")
  
  ASSERT_EQUAL "$TOTAL" "4" "泵站统计总数应为 4"
  ASSERT_EQUAL "$FIRST_STATION" "PS001" "第一个泵站应为 PS001"
  ASSERT_EQUAL "$PENDING_ALERTS" "0" "PS001 待处理告警应为 0"
  PASSED=$((PASSED + 3))
else
  echo -e "   ${RED}❌ API 调用失败${NC}"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤5: 测试待办事项列表 - 初始状态${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "获取待办事项列表"
RESPONSE=$(API_CALL GET "/summary/todo-list")
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")

if [ "$SUCCESS" = "true" ]; then
  TOTAL=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.total)})")
  ASSERT_EQUAL "$TOTAL" "0" "初始待办事项应为 0"
  PASSED=$((PASSED + 1))
else
  echo -e "   ${RED}❌ API 调用失败${NC}"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤6: 生成测试数据 - 签到${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "防汛值班员签到"
RESPONSE=$(API_CALL POST "/checkin" '{"station_id":"PS001","operator_name":"张三","checkin_type":"on_duty","remarks":"防汛值班开始"}')
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")

if [ "$SUCCESS" = "true" ]; then
  echo -e "   ${GREEN}✅ 签到成功${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "   ${RED}❌ 签到失败${NC}"
  echo "   $RESPONSE"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤7: 生成测试数据 - 水位上报（超警戒）${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "上报超警戒水位（触发告警）"
RESPONSE=$(API_CALL POST "/water-level" '{"station_id":"PS001","reporter":"张三","water_level":4.0,"rainfall":25.5,"remarks":"强降雨导致水位快速上涨"}')
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")
ALERT_GENERATED=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.alert_generated)})")

if [ "$SUCCESS" = "true" ] && [ "$ALERT_GENERATED" = "true" ]; then
  echo -e "   ${GREEN}✅ 水位上报成功，告警已生成${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "   ${RED}❌ 水位上报或告警生成失败${NC}"
  echo "   $RESPONSE"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤8: 验证待办事项列表 - 有告警${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "获取待办事项列表（应有告警）"
RESPONSE=$(API_CALL GET "/summary/todo-list")
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")

if [ "$SUCCESS" = "true" ]; then
  TOTAL=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.total)})")
  ALERT_COUNT=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.by_type.alert)})")
  FIRST_TYPE=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].type)})")
  
  ASSERT_EQUAL "$TOTAL" "1" "待办事项应为 1"
  ASSERT_EQUAL "$ALERT_COUNT" "1" "告警类型待办应为 1"
  ASSERT_EQUAL "$FIRST_TYPE" "alert" "第一条待办应为告警类型"
  PASSED=$((PASSED + 3))
else
  echo -e "   ${RED}❌ API 调用失败${NC}"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤9: 验证全局概览统计 - 有告警${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "获取全局概览统计（有告警）"
RESPONSE=$(API_CALL GET "/summary/overview")
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")

if [ "$SUCCESS" = "true" ]; then
  PENDING_ALERTS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.alerts)})")
  PENDING_TOTAL=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.total)})")
  WATER_LEVEL_NO_PUMP=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.water_level_over_no_pump)})")
  TODAY_CHECKINS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.today.checkins)})")
  TODAY_WATER_LEVELS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.today.water_level_reports)})")
  TOTAL_ALERTS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.total.alerts)})")
  OVER_WARNING=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.total.over_warning_levels)})")
  
  ASSERT_EQUAL "$PENDING_ALERTS" "1" "待处理告警应为 1"
  ASSERT_EQUAL "$PENDING_TOTAL" "1" "待处理总数应为 1"
  ASSERT_EQUAL "$WATER_LEVEL_NO_PUMP" "1" "水位超警戒未开泵告警应为 1"
  ASSERT_GREATER "$TODAY_CHECKINS" "0" "今日签到数应大于 0"
  ASSERT_GREATER "$TODAY_WATER_LEVELS" "0" "今日水位上报数应大于 0"
  ASSERT_GREATER "$TOTAL_ALERTS" "0" "告警总数应大于 0"
  ASSERT_GREATER "$OVER_WARNING" "0" "超警戒水位数应大于 0"
  PASSED=$((PASSED + 7))
else
  echo -e "   ${RED}❌ API 调用失败${NC}"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤10: 验证按泵站统计 - PS001 有告警${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "获取按泵站统计（PS001 有告警）"
RESPONSE=$(API_CALL GET "/summary/by-station?station_id=PS001")
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")

if [ "$SUCCESS" = "true" ]; then
  PENDING_ALERTS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].pending_alerts)})")
  PENDING_NO_PUMP=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].pending_no_pump_alerts)})")
  TOTAL_CHECKINS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].total_checkins)})")
  TOTAL_ALERTS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].total_alerts)})")
  OVER_WARNING=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].over_warning_levels)})")
  
  ASSERT_EQUAL "$PENDING_ALERTS" "1" "PS001 待处理告警应为 1"
  ASSERT_EQUAL "$PENDING_NO_PUMP" "1" "PS001 水位超警戒未开泵告警应为 1"
  ASSERT_GREATER "$TOTAL_CHECKINS" "0" "PS001 签到总数应大于 0"
  ASSERT_GREATER "$TOTAL_ALERTS" "0" "PS001 告警总数应大于 0"
  ASSERT_GREATER "$OVER_WARNING" "0" "PS001 超警戒水位数应大于 0"
  PASSED=$((PASSED + 5))
else
  echo -e "   ${RED}❌ API 调用失败${NC}"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤11: 验证单个泵站详情统计${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "获取 PS001 详情统计"
RESPONSE=$(API_CALL GET "/summary/station/PS001")
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")

if [ "$SUCCESS" = "true" ]; then
  STATION_CODE=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.station.code)})")
  PENDING_TOTAL=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.total)})")
  PENDING_ALERTS_LIST_LEN=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.alerts_list.length)})")
  RECENT_LOGS_LEN=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.recent_logs.length)})")
  LATEST_WL_STATION=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.latest.water_level.station_id)})")
  WATER_LEVEL_NO_PUMP=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.water_level_over_no_pump)})")
  
  ASSERT_EQUAL "$STATION_CODE" "PS001" "泵站编码应为 PS001"
  ASSERT_EQUAL "$PENDING_TOTAL" "1" "待处理总数应为 1"
  ASSERT_EQUAL "$PENDING_ALERTS_LIST_LEN" "1" "待处理告警列表长度应为 1"
  ASSERT_GREATER "$RECENT_LOGS_LEN" "0" "近期日志长度应大于 0"
  ASSERT_EQUAL "$LATEST_WL_STATION" "PS001" "最新水位所属泵站应为 PS001"
  ASSERT_EQUAL "$WATER_LEVEL_NO_PUMP" "1" "水位超警戒未开泵告警应为 1"
  PASSED=$((PASSED + 6))
else
  echo -e "   ${RED}❌ API 调用失败${NC}"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤12: 生成测试数据 - 开泵（自动解决告警）${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "泵站司机确认开泵"
RESPONSE=$(API_CALL POST "/pump-operations" '{"station_id":"PS001","pump_number":1,"operator_name":"李四","operation_type":"start","start_level":4.0,"duration":120,"remarks":"响应高水位告警开泵"}')
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")

if [ "$SUCCESS" = "true" ]; then
  echo -e "   ${GREEN}✅ 开泵确认成功${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "   ${RED}❌ 开泵确认失败${NC}"
  echo "   $RESPONSE"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤13: 验证数据一致性 - 开泵后告警应自动解决${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "验证数据一致性（待办、日志、查询结果一致）"

sleep 2

OVERVIEW=$(API_CALL GET "/summary/overview")
BY_STATION=$(API_CALL GET "/summary/by-station?station_id=PS001")
STATION_DETAIL=$(API_CALL GET "/summary/station/PS001")
TODO_LIST=$(API_CALL GET "/summary/todo-list")
ALERTS_LIST=$(API_CALL GET "/alerts?station_id=PS001")

OVERVIEW_PENDING=$(echo "$OVERVIEW" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.alerts)})")
BY_STATION_PENDING=$(echo "$BY_STATION" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].pending_alerts)})")
STATION_PENDING=$(echo "$STATION_DETAIL" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.alerts)})")
STATION_NO_PUMP=$(echo "$STATION_DETAIL" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.water_level_over_no_pump)})")
TODO_TOTAL=$(echo "$TODO_LIST" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.total)})")
ALERTS_STATUS=$(echo "$ALERTS_LIST" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].status)})")
AUTO_RESOLVED_COUNT=$(echo "$OVERVIEW" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.total.alerts)})")
STATION_AUTO_RESOLVED=$(echo "$STATION_DETAIL" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.total.auto_resolved_alerts)})")

ASSERT_EQUAL "$OVERVIEW_PENDING" "0" "全局概览: 待处理告警应为 0"
ASSERT_EQUAL "$BY_STATION_PENDING" "0" "按泵站统计: PS001 待处理告警应为 0"
ASSERT_EQUAL "$STATION_PENDING" "0" "泵站详情: 待处理告警应为 0"
ASSERT_EQUAL "$STATION_NO_PUMP" "0" "泵站详情: 水位超警戒未开泵告警应为 0"
ASSERT_EQUAL "$TODO_TOTAL" "0" "待办列表: 总数应为 0"
ASSERT_EQUAL "$ALERTS_STATUS" "auto_resolved" "告警列表: 最新告警状态应为 auto_resolved"
ASSERT_EQUAL "$STATION_AUTO_RESOLVED" "1" "泵站详情: 自动解决告警数应为 1"

PASSED=$((PASSED + 7))

echo -e "\n   ${BLUE}📊 数据一致性验证:${NC}"
echo -e "      全局概览待处理: ${OVERVIEW_PENDING}"
echo -e "      按泵站统计待处理: ${BY_STATION_PENDING}"
echo -e "      泵站详情待处理: ${STATION_PENDING}"
echo -e "      待办列表总数: ${TODO_TOTAL}"
echo -e "      告警实际状态: ${ALERTS_STATUS}"
echo -e "   ${GREEN}✅ 所有数据源保持一致${NC}"

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤14: 验证每日趋势统计${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "获取近7天趋势统计"
RESPONSE=$(API_CALL GET "/summary/daily?days=7")
SUCCESS=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).success)})")

if [ "$SUCCESS" = "true" ]; then
  DATA_LEN=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.length)})")
  TODAY_DATA=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    const today = new Date().toISOString().split('T')[0];
    const arr = JSON.parse(d).data;
    const todayItem = arr.find(item => item.date === today);
    console.log(todayItem ? todayItem.checkins : '0');
  })")
  
  ASSERT_GREATER "$DATA_LEN" "0" "趋势统计数据长度应大于 0"
  ASSERT_GREATER "$TODAY_DATA" "0" "今日签到数应大于 0"
  PASSED=$((PASSED + 2))
else
  echo -e "   ${RED}❌ API 调用失败${NC}"
  FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤15: 验证规则 - 水位超警戒未开泵要报警${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "验证水位超警戒未开泵告警规则"

API_CALL POST "/water-level" '{"station_id":"PS002","reporter":"王五","water_level":4.0,"rainfall":30.0,"remarks":"测试告警规则"}' > /dev/null

sleep 1

TODO_LIST=$(API_CALL GET "/summary/todo-list")
OVERVIEW=$(API_CALL GET "/summary/overview")
BY_STATION=$(API_CALL GET "/summary/by-station?station_id=PS002")
STATION_DETAIL=$(API_CALL GET "/summary/station/PS002")

TODO_TODO_COUNT=$(echo "$TODO_LIST" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const list = JSON.parse(d).data.list;
  const ps002Alerts = list.filter(item => item.station_id === 'PS002' && item.type === 'alert');
  console.log(ps002Alerts.length);
})")

OVERVIEW_NO_PUMP=$(echo "$OVERVIEW" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.water_level_over_no_pump)})")

BY_STATION_NO_PUMP=$(echo "$BY_STATION" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].pending_no_pump_alerts)})")

STATION_NO_PUMP=$(echo "$STATION_DETAIL" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.water_level_over_no_pump)})")

STATION_ALERTS_LIST_NO_PUMP=$(echo "$STATION_DETAIL" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const list = JSON.parse(d).data.pending.alerts_list || [];
  const noPumpAlerts = list.filter(a => a.alert_type === 'water_level_over_no_pump');
  console.log(noPumpAlerts.length);
})")

ASSERT_EQUAL "$TODO_TODO_COUNT" "1" "待办列表: PS002 应有 1 条告警"
ASSERT_EQUAL "$OVERVIEW_NO_PUMP" "1" "全局概览: 水位超警戒未开泵告警应为 1"
ASSERT_EQUAL "$BY_STATION_NO_PUMP" "1" "按泵站统计: PS002 水位超警戒未开泵告警应为 1"
ASSERT_EQUAL "$STATION_NO_PUMP" "1" "泵站详情: PS002 水位超警戒未开泵告警应为 1"
ASSERT_EQUAL "$STATION_ALERTS_LIST_NO_PUMP" "1" "泵站详情告警列表: 应有 1 条 water_level_over_no_pump 类型告警"

PASSED=$((PASSED + 5))

echo -e "\n   ${BLUE}📊 告警规则验证:${NC}"
echo -e "      待办列表 PS002 告警数: ${TODO_TODO_COUNT}"
echo -e "      全局概览未开泵告警数: ${OVERVIEW_NO_PUMP}"
echo -e "      按泵站统计 PS002 未开泵告警数: ${BY_STATION_NO_PUMP}"
echo -e "      泵站详情 PS002 未开泵告警数: ${STATION_NO_PUMP}"
echo -e "   ${GREEN}✅ 水位超警戒未开泵告警规则生效${NC}"

echo -e "\n${BLUE}------------------------------------------------------------${NC}"
echo -e "${BLUE}  步骤16: 验证查询结果一致性 - PS002 告警${NC}"
echo -e "${BLUE}------------------------------------------------------------${NC}"

TEST_CASE "验证查询结果一致性（泵站档案、待办、日志）"

ALERTS_API=$(API_CALL GET "/alerts/pending?station_id=PS002")
ALERTS_API_COUNT=$(echo "$ALERTS_API" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.total)})")

SUMMARY_OVERVIEW=$(API_CALL GET "/summary/overview")
SUMMARY_PENDING_ALERTS=$(echo "$SUMMARY_OVERVIEW" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.alerts)})")

SUMMARY_BY_STATION=$(API_CALL GET "/summary/by-station?station_id=PS002")
SUMMARY_BY_STATION_PENDING=$(echo "$SUMMARY_BY_STATION" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.list[0].pending_alerts)})")

SUMMARY_STATION=$(API_CALL GET "/summary/station/PS002")
SUMMARY_STATION_PENDING=$(echo "$SUMMARY_STATION" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.alerts)})")
SUMMARY_STATION_ALERTS_LIST=$(echo "$SUMMARY_STATION" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.parse(d).data.pending.alerts_list.length)})")

TODO=$(API_CALL GET "/summary/todo-list?station_id=PS002")
TODO_ALERTS=$(echo "$TODO" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const list = JSON.parse(d).data.list || [];
  const alerts = list.filter(t => t.type === 'alert');
  console.log(alerts.length);
})")

ASSERT_EQUAL "$ALERTS_API_COUNT" "1" "告警 API: PS002 待处理告警应为 1"
ASSERT_EQUAL "$SUMMARY_PENDING_ALERTS" "1" "统计概览: 待处理告警应为 1"
ASSERT_EQUAL "$SUMMARY_BY_STATION_PENDING" "1" "按泵站统计: PS002 待处理告警应为 1"
ASSERT_EQUAL "$SUMMARY_STATION_PENDING" "1" "泵站详情: 待处理告警应为 1"
ASSERT_EQUAL "$SUMMARY_STATION_ALERTS_LIST" "1" "泵站详情告警列表: 长度应为 1"
ASSERT_EQUAL "$TODO_ALERTS" "1" "待办列表: PS002 告警数应为 1"

PASSED=$((PASSED + 6))

echo -e "\n   ${BLUE}📊 查询结果一致性验证:${NC}"
echo -e "      告警 API 待处理数: ${ALERTS_API_COUNT}"
echo -e "      统计概览待处理数: ${SUMMARY_PENDING_ALERTS}"
echo -e "      按泵站统计待处理数: ${SUMMARY_BY_STATION_PENDING}"
echo -e "      泵站详情待处理数: ${SUMMARY_STATION_PENDING}"
echo -e "      泵站详情告警列表数: ${SUMMARY_STATION_ALERTS_LIST}"
echo -e "      待办列表告警数: ${TODO_ALERTS}"
echo -e "   ${GREEN}✅ 所有查询结果保持一致${NC}"

echo -e "\n${BLUE}============================================================${NC}"
echo -e "${BLUE}  测试结果汇总${NC}"
echo -e "${BLUE}============================================================${NC}"

echo -e "\n${GREEN}✅ 通过: ${PASSED}${NC}"
if [ "$FAILED" -gt "0" ]; then
  echo -e "${RED}❌ 失败: ${FAILED}${NC}"
else
  echo -e "${GREEN}❌ 失败: ${FAILED}${NC}"
fi

TOTAL=$((PASSED + FAILED))
echo -e "${YELLOW}📊 总计: ${TOTAL}${NC}"

if [ "$FAILED" -eq "0" ]; then
  echo -e "\n${GREEN}============================================================${NC}"
  echo -e "${GREEN}  🎉 所有测试通过！统计汇总功能验证成功！${NC}"
  echo -e "${GREEN}============================================================${NC}"
  echo -e "\n${BLUE}📋 验证的功能点:${NC}"
  echo -e "   ✅ 全局概览统计"
  echo -e "   ✅ 按泵站统计"
  echo -e "   ✅ 单个泵站详情统计"
  echo -e "   ✅ 每日趋势统计"
  echo -e "   ✅ 待办事项列表"
  echo -e "   ✅ 数据一致性（泵站档案、待办、日志、查询结果）"
  echo -e "   ✅ 水位超警戒未开泵告警规则"
  echo -e "   ✅ 开泵后告警自动解决"
  exit 0
else
  echo -e "\n${RED}============================================================${NC}"
  echo -e "${RED}  ❌ 有 ${FAILED} 个测试失败，请检查代码${NC}"
  echo -e "${RED}============================================================${NC}"
  exit 1
fi

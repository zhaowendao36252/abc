import { useEffect, useMemo, useRef, useState } from "react";

const initialEvents = [
  { id: "E20260819042", risk: "高风险", type: "人员跌倒", status: "待处理", location: "体育馆 · 西侧楼梯间", time: "16:03:42", relativeTime: "刚刚", confidence: "98.6%", signals: ["CSI", "视觉", "声音"], title: "检测到疑似人员跌倒" },
  { id: "E20260819041", risk: "高风险", type: "非授权进入", status: "处理中", location: "实验楼 · 3 层机房", time: "16:01:18", relativeTime: "2 分钟前", confidence: "96.2%", signals: ["视觉", "门禁"], title: "非授权人员进入限制区域" },
  { id: "E20260819037", risk: "中风险", type: "异常声音", status: "待处理", location: "宿舍 A 区 · 2 栋北侧", time: "15:55:03", relativeTime: "8 分钟前", confidence: "91.4%", signals: ["声音", "CSI"], title: "识别到高分贝玻璃破碎声" },
  { id: "E20260819031", risk: "中风险", type: "异常停留", status: "处理中", location: "图书馆 · 西区四层", time: "15:49:27", relativeTime: "14 分钟前", confidence: "88.9%", signals: ["CSI", "视觉"], title: "人员在闭馆区域异常停留" },
  { id: "E20260819022", risk: "低风险", type: "异常停留", status: "已处置", location: "教学楼 B 栋 · 二层连廊", time: "15:37:51", relativeTime: "26 分钟前", confidence: "82.5%", signals: ["CSI"], title: "连廊区域人员聚集时间过长" },
  { id: "E20260819018", risk: "低风险", type: "异常声音", status: "已处置", location: "第一食堂 · 后勤通道", time: "15:25:40", relativeTime: "38 分钟前", confidence: "79.8%", signals: ["声音"], title: "后勤通道出现持续异常声响" },
];

const eventInsights = {
  人员跌倒: { title: "疑似人员跌倒", reason: "目标人体姿态在 1.2 秒内由直立转为水平，CSI 动态特征与视觉骨架变化高度吻合，同时检测到短促撞击声。", suggestion: "联系区域值班人员前往确认，同时保持感知节点持续跟踪。" },
  非授权进入: { title: "非授权人员进入限制区域", reason: "视觉节点识别到未登记人员，门禁记录中未找到对应授权，目标已在限制区域内停留超过 30 秒。", suggestion: "通知就近安保人员核验身份，并暂时关闭相关区域通行权限。" },
  异常声音: { title: "检测到异常高分贝声音", reason: "声学节点捕获到突发高频声纹，持续时间与玻璃破碎或硬物撞击特征相似，CSI 同步检测到区域内快速移动。", suggestion: "调取附近节点信号进行复核，并安排巡逻人员前往排查。" },
  异常停留: { title: "人员异常停留", reason: "目标在非开放区域持续停留，移动轨迹与正常通行模式存在明显差异，AI 已排除短暂停顿情况。", suggestion: "通过现场广播进行提醒，若目标继续停留则通知楼宇管理员处理。" },
  区域风险变化: { title: "区域风险水平异常变化", reason: "多个感知节点同时出现偏离历史基线的信号，区域风险指数在短时间内连续上升。", suggestion: "安排安全人员核查现场环境，并持续观察风险趋势。" },
};

const navGroups = [
  { label: "安全中心", items: [["⌂", "安全驾驶舱"], ["⌖", "数字校园地图"], ["◈", "多模态事件"], ["◇", "AI 分析中心"]] },
  { label: "资源与洞察", items: [["▦", "设备管理"], ["⌁", "风险预测"], ["⚙", "系统设置"]] },
];

const symbolMap = { 人员跌倒: ["人", "fall"], 异常停留: ["停", "stay"], 非授权进入: ["禁", "access"], 异常声音: ["声", "sound"], 区域风险变化: ["险", "access"] };
const riskClassMap = { 高风险: "high", 中风险: "medium", 低风险: "low" };
const statusClassMap = { 待处理: "pending", 处理中: "handling", 已处置: "resolved" };

function formatClock(date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date).replaceAll("/", "-");
}

function Sidebar({ open, onClose }) {
  return <>
    <aside className={`sidebar ${open ? "open" : ""}`} id="sidebar" aria-label="主导航">
      <a className="brand" href="/" aria-label="返回安全驾驶舱"><span className="brand-mark" aria-hidden="true">烬</span><span><strong>烬安全感知</strong><small>JIN CAMPUS AI</small></span></a>
      <nav className="nav-list">
        {navGroups.map((group) => <div key={group.label}><p className="nav-label">{group.label}</p>{group.items.map(([icon, label]) => <a className={`nav-item ${label === "多模态事件" ? "active" : ""}`} href={label === "多模态事件" ? "#events" : "#"} aria-current={label === "多模态事件" ? "page" : undefined} key={label}><span>{icon}</span>{label}{label === "多模态事件" && <b>12</b>}</a>)}</div>)}
      </nav>
      <div className="system-health"><div className="health-heading"><span>感知网络状态</span><strong>稳定</strong></div><div className="health-bar"><span /></div><p><i />248 / 256 个节点在线</p></div>
      <div className="profile"><span className="avatar">林</span><span><strong>林予安</strong><small>安全中心值班员</small></span><button type="button" aria-label="打开用户菜单">•••</button></div>
    </aside>
    <button className={`sidebar-backdrop ${open ? "show" : ""}`} type="button" onClick={onClose} aria-label="关闭导航" />
  </>;
}

function MetricCard({ tone, icon, label, value, suffix, note, badge }) {
  return <article className={`metric-card ${tone}`}><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value}{suffix && <sup>{suffix}</sup>}</strong><small>{note}</small></div><em>{badge}</em></article>;
}

function EventRow({ event, active, onSelect }) {
  const [symbol, symbolClass] = symbolMap[event.type];
  return <button className={`event-row ${active ? "active" : ""}`} type="button" onClick={() => onSelect(event.id)}>
    <span className={`risk-line ${riskClassMap[event.risk]}`} /><span className={`event-symbol ${symbolClass}`}>{symbol}</span>
    <span className="event-main"><strong>{event.title}</strong><small><i>⌖</i> {event.location}</small></span>
    <span className="fusion">{event.signals.map((signal) => <b key={signal}>{signal}</b>)}</span>
    <span className="event-confidence"><small>{event.confidence === "人工上报" ? "来源" : "置信度"}</small><strong>{event.confidence === "人工上报" ? "人工" : event.confidence}</strong></span>
    <span className="event-time"><strong>{event.relativeTime}</strong><small>{event.time}</small></span>
    <span className={`status ${statusClassMap[event.status]}`}>{event.status}</span><span className="row-arrow">›</span>
  </button>;
}

function DetailPanel({ event, mobileOpen, onClose, onDispatch, notify }) {
  const [assignee, setAssignee] = useState("张伟 · 体育馆安保");
  const insight = eventInsights[event.type];
  const riskClass = event.risk === "高风险" ? "risk-high" : event.risk === "中风险" ? "risk-medium" : "risk-low";
  const confidence = event.confidence === "人工上报" ? "待 AI 复核" : event.confidence;
  return <aside className={`detail-panel ${mobileOpen ? "open" : ""}`} aria-label="事件详情">
    <div className="detail-heading"><div><span className={`risk-badge ${riskClass}`}>{event.risk}</span><small>事件编号 {event.id}</small></div><button type="button" onClick={onClose} aria-label="关闭详情">×</button></div>
    <h2>{insight.title}</h2><p className="detail-location">⌖ {event.location}</p>
    <div className="scene-preview"><div className="scan-grid" /><span className="zone zone-one">CSI-07</span><span className="zone zone-two">VIS-12</span><div className="target-ring"><span /></div><div className="preview-caption"><i />实时感知画面 · 隐私脱敏</div></div>
    <div className="detail-tabs" role="tablist"><button className="active" type="button" role="tab">AI 分析</button><button type="button" role="tab" onClick={() => notify("暂无更多处置记录")}>处置记录</button></div>
    <section className="analysis-card"><div className="analysis-title"><span>✦</span><div><strong>AI 综合判断</strong><small>多模态融合置信度 {confidence}</small></div></div><p>{insight.reason}</p><div className="signal-bars"><label><span>CSI 空间感知 <b>99%</b></span><i><em style={{ width: "99%" }} /></i></label><label><span>视觉辅助分析 <b>97%</b></span><i><em style={{ width: "97%" }} /></i></label><label><span>声音事件识别 <b>84%</b></span><i><em style={{ width: "84%" }} /></i></label></div></section>
    <section className="suggestion"><strong><span>!</span>建议立即处置</strong><p>{insight.suggestion}</p></section>
    <label className="assign-field"><span>指派处置人员</span><select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option>张伟 · 体育馆安保</option><option>陈昕 · 校园巡逻组</option><option>李航 · 安全中心</option></select></label>
    <div className="detail-actions"><button className="secondary-button" type="button" onClick={() => notify("已标记为误报并进入复核队列")}>标记误报</button><button className="primary-button" type="button" onClick={() => onDispatch(event.id, assignee)}>确认并派单</button></div>
  </aside>;
}

function ManualEventModal({ open, onClose, onCreate }) {
  const firstFieldRef = useRef(null);
  const [form, setForm] = useState({ type: "", risk: "中风险", location: "", description: "" });
  useEffect(() => { if (open) firstFieldRef.current?.focus(); }, [open]);
  useEffect(() => {
    const handleEscape = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  if (!open) return null;
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = (event) => { event.preventDefault(); onCreate(form); setForm({ type: "", risk: "中风险", location: "", description: "" }); };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div className="modal-heading"><div><p>MANUAL EVENT</p><h2 id="modalTitle">登记人工事件</h2></div><button type="button" onClick={onClose} aria-label="关闭人工事件表单">×</button></div><form onSubmit={submit}><div className="form-grid">
    <label><span>事件类型</span><select ref={firstFieldRef} value={form.type} onChange={update("type")} required><option value="">请选择</option>{Object.keys(eventInsights).map((type) => <option key={type}>{type}</option>)}</select></label>
    <label><span>风险等级</span><select value={form.risk} onChange={update("risk")} required><option>中风险</option><option>高风险</option><option>低风险</option></select></label>
    <label className="full-field"><span>发生位置</span><input value={form.location} onChange={update("location")} required maxLength="40" placeholder="例如：教学楼 A 栋 · 一层大厅" /></label>
    <label className="full-field"><span>事件描述</span><textarea value={form.description} onChange={update("description")} required maxLength="120" placeholder="简要描述现场异常情况" /><small><b>{form.description.length}</b> / 120</small></label>
  </div><div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">确认登记</button></div></form></section></div>;
}

export default function App() {
  const [events, setEvents] = useState(initialEvents);
  const [selectedId, setSelectedId] = useState(initialEvents[0].id);
  const [filters, setFilters] = useState({ keyword: "", risk: "all", type: "all", status: "all" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [timeline, setTimeline] = useState(false);
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [toast, setToast] = useState("");

  useEffect(() => { const timer = window.setInterval(() => setClock(formatClock(new Date())), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { document.body.classList.toggle("modal-open", modalOpen); return () => document.body.classList.remove("modal-open"); }, [modalOpen]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    const searchText = `${event.id} ${event.title} ${event.location} ${event.type}`.toLowerCase();
    return (!filters.keyword || searchText.includes(filters.keyword.toLowerCase())) && (filters.risk === "all" || event.risk === filters.risk) && (filters.type === "all" || event.type === filters.type) && (filters.status === "all" || event.status === filters.status);
  }), [events, filters]);
  const selectedEvent = events.find((event) => event.id === selectedId) || events[0];
  const setFilter = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));

  function selectEvent(id) { setSelectedId(id); setDetailOpen(true); }
  function dispatchEvent(id, assignee) { setEvents((current) => current.map((event) => event.id === id ? { ...event, status: "处理中" } : event)); setToast(`事件已派发给 ${assignee.split(" · ")[0]}`); }
  function createEvent(form) {
    const now = new Date();
    const item = { id: `M${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getTime()).slice(-4)}`, risk: form.risk, type: form.type, status: "待处理", location: form.location.trim(), time: now.toLocaleTimeString("zh-CN", { hour12: false }), relativeTime: "刚刚", confidence: "人工上报", signals: ["人工上报"], title: form.description.trim() };
    setEvents((current) => [item, ...current]); setSelectedId(item.id); setModalOpen(false); setToast(`人工事件 ${item.id} 已登记`);
  }
  function exportCsv() {
    const rows = [["事件编号", "事件类型", "风险等级", "发生位置", "发生时间", "处理状态", "AI置信度"], ...filteredEvents.map((event) => [event.id, event.type, event.risk, event.location, event.time, event.status, event.confidence])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `校园安全事件_${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url); setToast(`已导出 ${filteredEvents.length} 条事件`);
  }

  return <div className="app-shell">
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <div className="main-wrap"><header className="topbar"><button className="menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="展开导航">☰</button><div className="campus-state"><i /><span>东校区</span><b>态势感知运行中</b></div><div className="top-actions"><span className="clock">{clock}</span><button className="icon-button" type="button" aria-label="全局搜索">⌕</button><button className="icon-button has-alert" type="button" aria-label="通知">♢</button></div></header>
      <main className="content"><section className="page-heading"><div><p className="eyebrow"><span /> MULTIMODAL EVENT CENTER</p><h1>多模态事件中心</h1><p>融合 CSI、视觉与声音信号，聚合校园异常事件并提供智能处置建议。</p></div><div className="heading-actions"><button className="secondary-button" type="button" onClick={exportCsv}>⇩ 导出事件</button><button className="primary-button" type="button" onClick={() => setModalOpen(true)}>＋ 新建人工事件</button></div></section>
        <section className="metrics" aria-label="事件概览"><MetricCard tone="danger" icon="!" label="待处理事件" value={events.filter((event) => event.status === "待处理").length} note="↑ 3 较昨日同时段" badge="高风险 4" /><MetricCard tone="warning" icon="◌" label="今日已处置" value="28" note="平均响应 4m 12s" badge="效率 +18%" /><MetricCard tone="success" icon="✓" label="AI 判断准确率" value="96.8" suffix="%" note="已分析 1,284 条信号" badge="持续学习" /><MetricCard tone="info" icon="⌁" label="当前感知区域" value="42" note="覆盖 18 栋校园建筑" badge="在线率 96.9%" /></section>
        <section className="workspace" id="events"><div className="event-panel"><form className="filter-form" onSubmit={(event) => event.preventDefault()} onReset={() => setFilters({ keyword: "", risk: "all", type: "all", status: "all" })}><label className="search-field"><span>⌕</span><input type="search" value={filters.keyword} onChange={setFilter("keyword")} placeholder="搜索事件编号、位置或关键词" /></label><label><span className="sr-only">风险等级</span><select value={filters.risk} onChange={setFilter("risk")}><option value="all">全部风险等级</option><option>高风险</option><option>中风险</option><option>低风险</option></select></label><label><span className="sr-only">事件类型</span><select value={filters.type} onChange={setFilter("type")}><option value="all">全部事件类型</option>{Object.keys(eventInsights).map((type) => <option key={type}>{type}</option>)}</select></label><label><span className="sr-only">处理状态</span><select value={filters.status} onChange={setFilter("status")}><option value="all">全部处理状态</option><option>待处理</option><option>处理中</option><option>已处置</option></select></label><button className="filter-button" type="submit">筛选</button><button className="reset-button" type="reset">重置</button></form>
          <div className="panel-toolbar"><div><h2>实时事件流</h2><span>共 {filteredEvents.length} 条事件</span></div><div className="view-tabs" role="tablist"><button className={!timeline ? "active" : ""} type="button" onClick={() => setTimeline(false)} aria-selected={!timeline}>列表</button><button className={timeline ? "active" : ""} type="button" onClick={() => setTimeline(true)} aria-selected={timeline}>时间轴</button></div></div>
          <div className={`event-list ${timeline ? "timeline-view" : ""}`}>{filteredEvents.map((event) => <EventRow event={event} active={event.id === selectedId} onSelect={selectEvent} key={event.id} />)}{filteredEvents.length === 0 && <div className="empty-state"><span>⌕</span><strong>没有找到匹配事件</strong><p>请调整筛选条件后重试。</p></div>}</div></div>
          <DetailPanel event={selectedEvent} mobileOpen={detailOpen} onClose={() => setDetailOpen(false)} onDispatch={dispatchEvent} notify={setToast} />
        </section>
      </main>
    </div>
    <ManualEventModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={createEvent} />
    <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite"><span>✓</span><p>{toast}</p></div>
  </div>;
}

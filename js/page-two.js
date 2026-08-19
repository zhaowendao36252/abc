const rows = [...document.querySelectorAll(".event-row")];
const filterForm = document.querySelector("#filterForm");
const searchInput = document.querySelector("#searchInput");
const riskFilter = document.querySelector("#riskFilter");
const typeFilter = document.querySelector("#typeFilter");
const statusFilter = document.querySelector("#statusFilter");
const resultCount = document.querySelector("#resultCount");
const emptyState = document.querySelector("#emptyState");
const detailPanel = document.querySelector("#detailPanel");
const toast = document.querySelector("#toast");
let toastTimer;

function applyFilters() {
  const keyword = searchInput.value.trim().toLowerCase();
  let visibleCount = 0;

  rows.forEach((row) => {
    const matchesKeyword = !keyword || row.dataset.search.toLowerCase().includes(keyword) || row.dataset.id.toLowerCase().includes(keyword);
    const matchesRisk = riskFilter.value === "all" || row.dataset.risk === riskFilter.value;
    const matchesType = typeFilter.value === "all" || row.dataset.type === typeFilter.value;
    const matchesStatus = statusFilter.value === "all" || row.dataset.status === statusFilter.value;
    const isVisible = matchesKeyword && matchesRisk && matchesType && matchesStatus;
    row.hidden = !isVisible;
    visibleCount += Number(isVisible);
  });

  resultCount.textContent = `共 ${visibleCount} 条事件`;
  emptyState.hidden = visibleCount !== 0;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.querySelector("p").textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyFilters();
});

filterForm.addEventListener("reset", () => {
  window.setTimeout(applyFilters, 0);
});

searchInput.addEventListener("input", applyFilters);
[riskFilter, typeFilter, statusFilter].forEach((select) => select.addEventListener("change", applyFilters));

rows.forEach((row) => {
  row.addEventListener("click", () => {
    rows.forEach((item) => item.classList.remove("active"));
    row.classList.add("active");
    detailPanel.classList.add("open");
  });
});

document.querySelector("#closeDetail").addEventListener("click", () => detailPanel.classList.remove("open"));

document.querySelector("#dispatchButton").addEventListener("click", () => {
  const assignee = document.querySelector("#assigneeSelect").value.split(" · ")[0];
  const activeRow = document.querySelector(".event-row.active");
  if (activeRow) {
    activeRow.dataset.status = "处理中";
    const status = activeRow.querySelector(".status");
    status.textContent = "处理中";
    status.className = "status handling";
  }
  showToast(`事件已派发给 ${assignee}`);
  applyFilters();
});

document.querySelector("#falseAlarmButton").addEventListener("click", () => showToast("已标记为误报并进入复核队列"));
document.querySelector("#exportButton").addEventListener("click", () => showToast("事件清单已生成，正在准备下载"));
document.querySelector("#createButton").addEventListener("click", () => showToast("人工事件登记功能已打开"));

document.querySelectorAll(".view-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".view-tabs button").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-selected", String(item === button));
    });
    showToast(`已切换到${button.textContent}视图`);
  });
});

const sidebar = document.querySelector("#sidebar");
const menuButton = document.querySelector("#menuButton");
const sidebarBackdrop = document.querySelector("#sidebarBackdrop");

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarBackdrop.classList.remove("show");
  menuButton.setAttribute("aria-expanded", "false");
}

menuButton.addEventListener("click", () => {
  const shouldOpen = !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", shouldOpen);
  sidebarBackdrop.classList.toggle("show", shouldOpen);
  menuButton.setAttribute("aria-expanded", String(shouldOpen));
});
sidebarBackdrop.addEventListener("click", closeSidebar);

function updateClock() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now).replaceAll("/", "-");
  document.querySelector("#clock").textContent = date;
}

updateClock();
window.setInterval(updateClock, 1000);

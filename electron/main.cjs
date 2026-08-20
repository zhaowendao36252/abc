const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");

let mainWindow = null;
let serviceProcess = null;
let serviceLogPath = "";

function writeServiceLog(message) {
  if (!serviceLogPath) return;
  fs.appendFileSync(serviceLogPath, `[${new Date().toISOString()}] ${message}\n`);
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 17321;
      server.close(() => resolve(port));
    });
  });
}

async function waitForService(url, process) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`账本服务已停止（代码 ${process.exitCode}）。详细信息：${serviceLogPath}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("账本服务启动超时");
}

async function startLedgerService() {
  const port = await reservePort();
  const root = app.isPackaged ? path.join(process.resourcesPath, "app") : app.getAppPath();
  const cli = path.join(root, "node_modules", "vinext", "dist", "cli.js");
  const url = `http://127.0.0.1:${port}/`;

  if (!fs.existsSync(cli)) throw new Error(`找不到内置服务文件：${cli}`);
  serviceLogPath = path.join(app.getPath("userData"), "ledger-service.log");
  fs.writeFileSync(serviceLogPath, "");
  writeServiceLog(`starting service from ${root}`);

  serviceProcess = spawn(
    process.execPath,
    [cli, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        ELECTRON_NO_ATTACH_CONSOLE: "1",
      },
    },
  );
  serviceProcess.stdout.on("data", (data) => writeServiceLog(data.toString().trim()));
  serviceProcess.stderr.on("data", (data) => writeServiceLog(data.toString().trim()));
  serviceProcess.on("error", (error) => writeServiceLog(`spawn error: ${error.message}`));
  serviceProcess.on("exit", (code, signal) => writeServiceLog(`service exited: code=${code}, signal=${signal}`));

  await waitForService(url, serviceProcess);
  return url;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    title: "拾光账本",
    backgroundColor: "#eee5d2",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.setFrameRate(60);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadURL(url);
}

function stopLedgerService() {
  if (!serviceProcess || serviceProcess.killed) return;
  serviceProcess.kill();
  serviceProcess = null;
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    const url = await startLedgerService();
    createWindow(url);
  } catch (error) {
    dialog.showErrorBox(
      "拾光账本启动失败",
      error instanceof Error ? error.message : "无法启动内置服务",
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopLedgerService();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopLedgerService);

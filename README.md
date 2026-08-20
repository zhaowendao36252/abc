# 拾光账本

用于票据 OCR、收支记录、报账人管理和历史恢复的本地账本应用。

## 在本项目中运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

常用命令：

- `npm run build`：构建 Web 版本
- `npm test`：构建并运行渲染检查
- `npm run desktop:build`：生成 Windows 安装包

## 数据位置与备份

本次迁移已将本地 D1 数据库带入 `.wrangler/state/v3/d1/`，因此它不再依赖原账本项目目录。

该目录按默认规则不纳入 Git；请在迁移电脑、重装系统或清理项目之前，将整个 `.wrangler/state/v3/d1/` 目录另行备份。浏览器/桌面端的离线缓存还保存在各自的本地存储中。

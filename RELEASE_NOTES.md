# 发版说明 · v1.0.0

发布日期：2026-06-18

Claude Code 项目启动器首个正式版本，一个帮助开发者快速发现、启动 Claude Code 项目并管理常用命令的 uTools 插件。

## 本次更新

1. 项目启动器（`cc` / `ccstart`）：自动扫描 `~/.claude/projects`，按最近使用排序，支持搜索、方向键导航与 `Alt+数字` 快捷启动。
2. 命令运行器（`ccrun`）：内置 Claude CLI、OpenSpec、npm、Git 等常用命令，选中即在终端执行。
3. 统一配置中心（`cconf` / `配置`）：启动命令、终端、快捷命令集中管理，左右分栏卡片式界面。
4. 启动命令单选：内置 `claude` 及 `--continue`、`--resume`、`--dangerously-skip-permissions` 变体，支持自定义增删改。
5. 多终端支持：Windows PowerShell、Windows Terminal、PowerShell 7、CMD 及自定义路径；macOS / Linux 自动适配。
6. 终端路径可见可编辑，遇非标准安装位置也能正常启动，可一键恢复默认。
7. 快捷命令全部可增删改，包括内置默认命令（覆盖层实现，可恢复默认）。
8. 现代化卡片式界面，自动适配亮 / 暗色主题，全局统一滚动条样式。
9. 智能路径识别：优先从会话记录解析项目真实目录，避免启动到错误位置。
10. 旧版本设置自动迁移，无需手动处理。

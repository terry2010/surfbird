# Surfbird

<p>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"></a>
<a href="https://github.com/terry2010/surfbird/actions/workflows/release.yml"><img src="https://github.com/terry2010/surfbird/actions/workflows/release.yml/badge.svg" alt="release"></a>
<a href="https://hub.docker.com/r/terry2010/surfbird"><img src="https://img.shields.io/badge/docker-terry2010%2Fsurfbird-2496ED.svg" alt="Docker Hub"></a>
</p>

[English](README.md) | **中文**

**Kitesurf，自托管。** [Cloudflare Kitesurf](https://github.com/cloudflare/kitesurf) 的非官方 Docker 发行版——一个为 AI agent 而生的实验性浏览器引擎。

> 与 Cloudflare 无隶属或背书关系。Kitesurf 以 Apache-2.0 许可发布。

Kitesurf 解析 HTML、应用 CSS、执行页面 JavaScript 并渲染截图——没有 Chrome、没有浏览器容器——并且讲 CDP，Puppeteer/Playwright 照常连接。上游只支持本地 `wrangler dev` 或部署到 Cloudflare Workers（付费）。Surfbird 把它打包到任意 VPS 上运行。

## 镜像

| 标签 | 内容 | 用途 |
|---|---|---|
| `terry2010/surfbird:raw` | 仅引擎，`:8787` | 本地 / 放在你自己的网关后面 |
| `terry2010/surfbird:auth` | 引擎 + token 认证代理 + 可选 TLS，`:8080` | 一条命令即可对外 |
| `terry2010/surfbird:latest` | = `:auth` | 方便的默认值 |

上游每发一个新 tag，镜像每天自动构建；也发布按 tag 固定的版本，如 `terry2010/surfbird:auth-2026.11.8`。**架构：仅 `linux/amd64`**（引擎用 Bazel 针对 amd64 构建）——ARM 主机需 qemu 模拟（慢）或用[预构建方式](#构建)自行出原生镜像。

## 快速开始

```bash
# raw —— 仅引擎，无认证。只绑回环/内网！
docker run -d -p 127.0.0.1:8787:8787 terry2010/surfbird:raw

# auth —— 一条命令，token + REST actions
docker run -d -p 127.0.0.1:8080:8080 -e SURFBIRD_TOKEN=$(openssl rand -hex 24) terry2010/surfbird:auth
```

## 用法

**CDP（Puppeteer / Playwright / chrome-devtools-mcp）：**

```js
puppeteer.connect({
  browserWSEndpoint: "ws://<host>:8787/devtools/browser",       // raw
  // 或 auth 镜像：
  browserWSEndpoint: "ws://<host>:8080/devtools/browser",
  headers: { Authorization: "Bearer <token>" },
});
```

**REST（仅 auth 镜像）：**

```bash
curl -H "Authorization: Bearer $TOKEN" \
     -d '{"url":"https://zhuikan.com/repos/terry2010__surfbird","fullPage":true}' \
     http://<host>:8080/screenshot -o page.png

curl -H "Authorization: Bearer $TOKEN" \
     -d '{"url":"https://zhuikan.com/repos/terry2010__surfbird"}' \
     http://<host>:8080/markdown | jq -r .markdown
```

端点：`POST /screenshot | /pdf | /content | /source | /markdown | /evaluate | /batch`（一个 action 作用于最多 `MAX_BATCH_URLS` 个 url，逐项返回结果）、`GET /health`、`GET /openapi.json`。`/content` 返回 JS 执行后的渲染 DOM；`/source` 返回原始响应体（即"查看源码"）。
其余路径全部透明代理到引擎（落地页、`/json/*`、`/rbi/*`）。

**JS/TS 客户端：** npm 上的 [`surfbird`](https://www.npmjs.com/package/surfbird)——`new Surfbird(url,{token}).markdown(u)` 等，外加 `sb.batch(action, urls)`。

## MCP（Model Context Protocol）

两种方式把 Surfbird 接入支持 MCP 的 agent（Claude Code、Cursor、Windsurf……）：

**A. `surfbird-mcp` —— 薄封装（推荐）。** 把我们的 REST actions 暴露为 MCP 工具——包括 `surf_markdown` 和 `surf_batch`，这是原生浏览器 MCP 没有的：

```json
{
  "mcpServers": {
    "surfbird": {
      "command": "npx",
      "args": ["-y", "surfbird-mcp"],
      "env": {
        "SURFBIRD_URL": "http://<host>:8080",
        "SURFBIRD_TOKEN": "<token>"
      }
    }
  }
}
```

工具：`surf_markdown` `surf_content` `surf_source` `surf_screenshot` `surf_pdf` `surf_evaluate` `surf_batch` `surf_health`。

**B. `chrome-devtools-mcp` —— 完整 CDP 面。** 直连代理后的 WebSocket（`/devtools/browser` 带 Bearer 认证透传）——工具更多，部件也更多。见上游文档；如果你的客户端不能发自定义 WS 头，就在私网里跑 `raw` 镜像。

**不用 MCP 也行。** REST 层本身对 agent 就很友好——[`skills/surfbird/SKILL.md`](skills/surfbird/SKILL.md) 是一份即插即用的 skill，教任何 agent 用 `curl` 驱动它。

## Agent 插件

专门构建的插件，"像人一样"通过 CDP 驱动 Surfbird（或上游 Kitesurf）端点——每个插件 28 个 `surfbird_*` 工具：标签页管理、导航、带元素引用的语义快照、click/fill/type、等待、JS 求值、截图/PDF、console 与 network 检查、WebMCP。每个 agent 会话独占一台隔离浏览器。

- **[dsh-control-surfbird-for-kitesurf](https://github.com/terry2010/dsh-control-surfbird-for-kitesurf)** —— 面向 [DSH](https://www.deepseek.com/) agent；带设置界面、加密 token 文件，`dsh plugin install dsh-control-surfbird-for-kitesurf` 安装
- **[opencode-control-surfbird-for-kitesurf](https://github.com/terry2010/opencode-control-surfbird-for-kitesurf)** —— 面向 [OpenCode](https://opencode.ai/)（桌面应用 + TUI，内置设置页/弹窗）；`opencode plugin add opencode-control-surfbird-for-kitesurf` 安装
- **[pi-control-surfbird-for-kitesurf](https://github.com/terry2010/pi-control-surfbird-for-kitesurf)** —— 面向 [Pi](https://pi.dev/) coding agent；`/surfbird-settings` 命令配置，`pi install pi-control-surfbird-for-kitesurf` 安装

三者共享同一套 host 无关的 CDP 核心，`auth` 镜像（Bearer token）和 `raw` 镜像（仅限回环/私网）都能用。

## 示例

[`examples/`](examples/) —— 零依赖 Python 客户端（`rss_to_markdown.py` 把 RSS 源做成 markdown 摘要，供 LLM 日报使用）以及 bash/curl 脚本。

## 环境变量

| 变量 | 默认值 | 含义 |
|---|---|---|
| `SURFBIRD_TOKEN` | — | bearer token。**auth 模式没有它拒绝启动** |
| `SURFBIRD_PORT` | 8080 | 代理监听端口 |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | — | 挂载证书 → HTTPS。想要自动 ACME？把 Caddy 放在外面 |
| `REST_TIMEOUT_MS` | 120000 | 单 action 超时 |
| `MAX_CONCURRENT_ACTIONS` | 2 | 并发 REST actions 上限（每个 ≈ 一个引擎 isolate） |
| `MAX_BATCH_URLS` | 20 | `/batch` 单次最大 url 数 |
| `MAX_BODY_BYTES` | 4194304 | REST 请求体上限（超出返回 413） |
| `SURFBIRD_INSPECTOR` | — | `1` 在 :9229 打开 workerd 调试 inspector（仅回环，调试用） |
| `SURFBIRD_URL_ALLOWLIST` | — | 逗号分隔的正则——设置后只允许匹配的 url |
| `SURFBIRD_URL_BLOCKLIST` | — | 逗号分隔的正则——拒绝匹配的 url（如 `169\.254\.\|,^http://localhost`） |
| `ENGINE_READY_TIMEOUT_MS` | 120000 | 代理开始监听前等待引擎就绪的时长 |
| `SURFBIRD_MODE` | 随 target | `raw` / `auth` |

`GET /health` 不需要认证，仅当引擎应答时返回 200——可安全用于 LB 探活。任一进程死掉容器就退出；用 `--restart unless-stopped`。

上面绑定的是回环——远程实例走 SSH 隧道（`ssh -L 8080:127.0.0.1:8080 user@vps`）或 TLS 反向代理访问。暴露的引擎是一台能在你 VPS 上发请求的机器：token + 防火墙/TLS 是最低要求，`raw` 永远不要暴露。

## 构建

```bash
# A) 镜像内完整构建（需要 ~4GB+ 内存，CI 机器）：
docker build -f Dockerfile --target raw  -t surfbird:raw .
docker build -f Dockerfile --target auth -t surfbird:auth .

# B) 用本地已构建的 checkout（低配机器）：
./scripts/smoke-test.sh            # 通过 tar 暂存真实 ctx（软链不行——Docker COPY 不跟随）
# 或手动：
mkdir -p ctx/kitesurf && tar -C /path/to/kitesurf --exclude='*/node_modules' --exclude='*/.git' -cf - . | tar -C ctx/kitesurf -xf -
cp -r proxy ctx/proxy && cp entrypoint.sh Dockerfile.prebuilt ctx/
docker build -f ctx/Dockerfile.prebuilt ctx -t surfbird:raw
```

固定上游：`--build-arg KITESURF_REF=<commit|tag>`（Dockerfile A）。
引擎补丁：把 `.patch` 文件放进 `patches/`，在 clone 之后应用。

## 限制（来自上游，不是 Surfbird 的锅）

- 实验性引擎（Boa JS）——重 JS 站点可能渲染不完美
- 无触摸/拖拽手势、无视频解码、无浏览器式文件下载
- 构建中剔除了 DevTools 前端（对国内网络友好）；用 CDP
- auth 镜像加的是 token 门——它不是强化的多租户边界

## 许可证

Apache-2.0。Kitesurf © Cloudflare, Inc. 见上游 [NOTICE](https://github.com/cloudflare/kitesurf/blob/main/NOTICE)。

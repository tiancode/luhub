# 非 Docker 部署（直接用 Node）

适用于 NAS / VPS / 任意 Linux 主机,直接用 Node 跑生产,不用容器。
(想用容器见 [`docker/README.md`](../docker/README.md)。)

## 前置

- **Node ≥ 20.9**(建议 22 LTS)、**pnpm**(`corepack enable` 或 `npm i -g pnpm`)
- 用爬虫则需 **Python 3**;`better-sqlite3` 是原生模块,无预编译时还需构建工具
  (Debian/Ubuntu:`sudo apt install -y build-essential python3`)

## 首次部署

```bash
# 1) 取代码
git clone <仓库地址> /opt/luhub && cd /opt/luhub

# 2) 装依赖
pnpm install

# 3) 配 .env（见下）
cp .env.example .env && $EDITOR .env

# 4) 准备数据目录（= DATABASE_URL 的父目录；SQLite 不会自动创建父目录），再建表
sudo mkdir -p /var/lib/luhub && sudo chown "$USER":"$USER" /var/lib/luhub
pnpm db:deploy          # = prisma migrate deploy
# pnpm db:seed          # 可选：灌离线示例，方便先看界面

# 5) 构建并启动
pnpm build              # prisma generate && next build
pnpm start              # next start，默认监听 :3000（PORT 可改）
```

`.env` 关键项:

```ini
# SQLite 用绝对路径，放在可持久、会备份的目录；该目录需对运行用户可写
DATABASE_URL="file:/var/lib/luhub/dev.db"
# 采集后台登录密码（必填，否则 /admin 始终上锁）
ADMIN_PASSWORD="改成你的强密码"
# 可选：cookie 令牌密钥（不填用密码派生）
# ADMIN_SECRET=""
```

> `.env` 会被 Next / Prisma / 采集脚本自动加载;`DATABASE_URL`、`ADMIN_PASSWORD`
> 都是服务端运行时读取,改完重启服务即可生效(无需重新 `build`)。

## 常驻运行(systemd)

`/etc/systemd/system/luhub.service`:

```ini
[Unit]
Description=LuHub
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=luhub
WorkingDirectory=/opt/luhub
Environment=NODE_ENV=production
Environment=PORT=3000
# 若 pnpm 不在默认 PATH，补上它所在目录（corepack/npm 全局安装位置）
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/env pnpm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now luhub
sudo systemctl status luhub      # 查看状态
journalctl -u luhub -f           # 看日志
```

> 也可用 `pm2 start "pnpm start" --name luhub && pm2 save && pm2 startup`。

## 反向代理 + HTTPS

P2P 加速(WebRTC)要求安全上下文,**务必上 HTTPS**。

**Caddy**(自动签发证书,最省事)`/etc/caddy/Caddyfile`:

```
your.domain.com {
    reverse_proxy 127.0.0.1:3000
}
```

**Nginx**(配合 certbot 签证书):

```nginx
server {
    listen 80;
    server_name your.domain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 定时采集(cron)

html 适配器需要 Python 依赖:`pip install -r crawler/requirements.txt`(maccms 适配器零依赖)。

`crontab -e`(建议用运行服务的同一用户):

```cron
# 每天 03:00 增量采集某个你有权使用的 maccms 源
0 3 * * * cd /opt/luhub && /usr/bin/env pnpm collect:py --adapter=maccms --api=https://你的源/api.php/provide/vod/ --name=源名 --hours=24 >> /var/log/luhub-collect.log 2>&1
```

> `pnpm collect:py` / `pnpm collect` 与后台相互独立;后台「采集」按钮走 DB 中的源。

## 升级

```bash
cd /opt/luhub && git pull
pnpm install
pnpm db:deploy            # 有 schema 变更时（无变更也安全,幂等）
pnpm build
sudo systemctl restart luhub
```

## 注意

- **运行用户一致**:项目目录与数据目录(`DATABASE_URL` 的父目录)需归 systemd 里的运行用户(示例为 `luhub`)所有;否则服务无权读写。
- **SQLite 单写**:同一个库别跑多个应用实例;批量采集已串行。
- **备份**:定期备份 `DATABASE_URL` 指向的 `.db` 文件。
- 改 `.env` 后 **重启服务** 生效;改 `prisma/schema.prisma` 后先 `pnpm db:deploy`。
- 合规:只部署/采集你有权使用的内容。

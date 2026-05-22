# 自托管（Docker / Unraid）

网站与 Python 爬虫打在**同一个镜像**里;SQLite 数据库放在挂载卷上持久化。常驻
运行,`after()` 后台采集、长任务、定时爬都没有 serverless 的超时/临时盘问题。

涉及文件:`Dockerfile`、`docker-compose.yml`、`docker/entrypoint.sh`、`.dockerignore`。

## 在 Unraid 上部署

1. **把代码放到 NAS**(任一共享目录,例如):
   ```bash
   cd /mnt/user/appdata && git clone <仓库地址> luhub-src && cd luhub-src
   ```
2. **改密码**:编辑 `docker-compose.yml`,把 `ADMIN_PASSWORD` 改成你的后台登录密码。
3. **部署**(二选一):
   - **Compose Manager 插件**(推荐):新建 stack → 指向该目录的 `docker-compose.yml` → Compose Up(首次会在 NAS 上构建镜像,约几分钟)。
   - **命令行**:`docker compose up -d --build`。
4. 访问 `http://<NAS-IP>:3000`,后台在 `/admin`(用上面的密码登录)。

数据库文件在 `/mnt/user/appdata/luhub/dev.db`(挂载卷,持久化)——**记得纳入 Unraid 备份**。

### 首次灌示例数据(可选)
想先看到界面有内容:在 compose 里把 `SEED: "1"` 取消注释,起一次容器(会写入离线
示例数据),然后把该行删掉再重启。真实数据请在 `/admin/sources` 配置你有权使用的源后采集。

### 升级
```bash
cd /mnt/user/appdata/luhub-src && git pull
docker compose up -d --build      # 重新构建并滚动更新;迁移在容器启动时自动 deploy
```

## 定时采集(Unraid User Scripts)

装 **User Scripts** 插件,新建脚本,设 cron(如每天 03:00),内容示例:

```bash
#!/bin/bash
# 增量采集某个 maccms 源(换成你有权使用的接口)
docker exec luhub pnpm collect:py --adapter=maccms \
  --api=https://你的源/api.php/provide/vod/ --name=源名 --hours=24
```

也可用本地 mock 站点自测管线:`docker exec luhub pnpm demo:mock`。

> 说明:`pnpm collect:py` / `pnpm collect` 与后台相互独立;后台「采集」按钮走 DB 中的源。
> 按 DB 源批量定时采集是后续可加的小功能(目前 cron 里按源显式 `--api` 即可)。

## 远程访问(可选)

- **反向代理 + TLS**:用你 NAS 上的 **Nginx Proxy Manager / SWAG** 容器把域名指到 `luhub:3000`。
- **免端口转发**:**Tailscale** 或 **Cloudflare Tunnel**。

## 备注

- 运行时基于 `node:22-bookworm-slim`(glibc → better-sqlite3 预编译可用;勿用 alpine)。
- 未启用 Next 的 `output: standalone`:同镜像内要用 `tsx`/`pnpm` 跑爬虫,保留完整依赖更可靠。
- 合规:自托管也只部署你有权的内容。

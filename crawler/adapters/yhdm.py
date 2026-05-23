"""yhdm.one (樱花动漫) 采集适配器。

边抓边入库:``crawl()`` **逐部番剧产出**(每条 = 一部番的 maccms 响应),配合
``run.py`` 的流式 NDJSON + ``python.ts`` 的逐行入库——中途断开时已抓的番已落库。

断点续采(细粒度):上层(TS)经 ``--seen-file`` 把该源已入库的 ``vod_id`` 与其
**更新备注指纹**(``id<TAB>备注``)传进来。续采时对每个已入库项只抓**详情页**比对备注:
  - 备注未变 / 无法判断 -> 跳过昂贵的逐集 ``_get_plays``,不重抓;
  - 备注变化(``更新至12集`` -> ``更新至13集`` 等) -> 完整重抓,刷新新集。
备注是站点自己的集数信号,且入库/复查同处解析,不会因个别播放接口失败而漂移。
增量(``--hours``)模式不做跳过,以便刷新最近更新。
"""
from __future__ import annotations

import re
import sys
import time
from collections import defaultdict
from typing import Any, Iterable, Iterator

from ..models import build_play
from .base import Adapter

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


class YhdmAdapter(Adapter):
    name = "yhdm"
    rate_limit_ms = 500

    def __init__(self, base_url: str, **opts: Any) -> None:
        self.base_url = (base_url or "https://yhdm.one").rstrip("/")

    @classmethod
    def from_cli(cls, args: Any) -> "YhdmAdapter":
        # 支持用 --base-url 覆盖,否则默认 https://yhdm.one
        base_url = getattr(args, "base_url", None)
        return cls(base_url or "https://yhdm.one")

    # ---------- HTTP / 限速 / 文本归一 ----------
    def _client(self):
        try:
            import httpx
            import bs4  # noqa: F401  仅校验依赖存在,实际在各 helper 内延迟使用
        except ImportError as e:
            raise SystemExit(
                "YhdmAdapter 需要 httpx 与 beautifulsoup4:pip install -r crawler/requirements.txt"
            ) from e
        return httpx.Client(headers={"User-Agent": UA}, timeout=30.0, follow_redirects=True)

    def _sleep(self) -> None:
        if self.rate_limit_ms > 0:
            time.sleep(self.rate_limit_ms / 1000.0)

    @staticmethod
    def _norm(s: str | None) -> str:
        """归一化备注指纹:折叠空白,去首尾(也保证不含制表符/换行,可安全写入 seen-file)。"""
        return re.sub(r"\s+", " ", s or "").strip()

    @staticmethod
    def _parse_seen(seen_ids: Iterable[str] | None) -> dict[str, str | None]:
        """解析 seen 条目:``id`` 或 ``id<TAB>备注指纹`` -> {id: 指纹|None}。"""
        out: dict[str, str | None] = {}
        for entry in seen_ids or ():
            s = str(entry).rstrip("\n")
            if not s.strip():
                continue
            if "\t" in s:
                vid, fp = s.split("\t", 1)
                out[vid.strip()] = fp.strip() or None
            else:
                out[s.strip()] = None
        return out

    # ---------- 列表 / 最近更新页:产出候选 vod_id + 总页数 ----------
    def _candidate_ids(
        self, client, *, page: int, hours: int | None
    ) -> tuple[list[str], int]:
        from bs4 import BeautifulSoup

        hrefs: list[str] = []
        pagecount = 1

        if hours is not None:
            from datetime import datetime, timedelta

            url = f"{self.base_url}/latest/"
            print(f"Crawling latest updates (hours={hours}): {url}...", file=sys.stderr)
            try:
                resp = client.get(url)
                resp.raise_for_status()
            except Exception as e:
                print(f"Failed to fetch latest page: {e}", file=sys.stderr)
                return [], 0  # 0 = 抓取失败(区别于成功但单页的 1)
            soup = BeautifulSoup(resp.text, "html.parser")
            threshold = datetime.now() - timedelta(hours=hours)
            for li in soup.select(".latest-ul li"):
                a = li.select_one("a.names")
                em = li.select_one("em")
                if not a or not em:
                    continue
                date_str = em.get_text(strip=True)  # e.g. 2026-05-23
                try:
                    item_date = datetime.strptime(date_str, "%Y-%m-%d")
                    # 日期无时分,以当天结束(+1 天)作为边界
                    if item_date + timedelta(days=1) < threshold:
                        continue
                except Exception as e:
                    print(f"Failed to parse date '{date_str}': {e}", file=sys.stderr)
                hrefs.append(a.get("href", ""))
        else:
            url = f"{self.base_url}/list/?page={page}"
            print(f"Crawling list page {page}: {url}...", file=sys.stderr)
            try:
                resp = client.get(url)
                resp.raise_for_status()
            except Exception as e:
                print(f"Failed to fetch list page: {e}", file=sys.stderr)
                return [], 0  # 0 = 抓取失败(区别于成功但单页的 1)
            soup = BeautifulSoup(resp.text, "html.parser")
            pages_el = soup.select_one(".pages")
            if pages_el:
                m = re.search(r"页次：\d+/(\d+)页", pages_el.get_text(strip=True))
                if m:
                    pagecount = int(m.group(1))
            for li in soup.select(".list-unstyled li"):
                a = li.select_one("a[href^='/vod/']")
                if a:
                    hrefs.append(a.get("href", ""))

        ids: list[str] = []
        seen: set[str] = set()
        for href in hrefs:
            m = re.search(r"/(?:vod|vod-play)/(\d+)", href)
            if not m:
                continue
            vid = m.group(1)
            if vid in seen:  # 同页去重
                continue
            seen.add(vid)
            ids.append(vid)
        return ids, pagecount

    # ---------- 详情页 helper(尽量复用同一份 soup,避免重复请求) ----------
    def _fetch_detail_soup(self, client, vod_id: str):
        from bs4 import BeautifulSoup

        detail_url = f"{self.base_url}/vod/{vod_id}.html"
        print(f"Fetching detail {vod_id}: {detail_url}...", file=sys.stderr)
        try:
            resp = client.get(detail_url)
            resp.raise_for_status()
        except Exception as e:
            print(f"Failed to fetch detail for {vod_id}: {e}", file=sys.stderr)
            return None
        return BeautifulSoup(resp.text, "html.parser")

    def _remark(self, soup) -> str:
        """详情页更新备注(``更新至N集`` 那个 color:red 元素)。"""
        el = soup.find(
            lambda tag: tag.name in ("div", "span")
            and tag.get("style")
            and "color: red" in tag.get("style")
        )
        return el.get_text(strip=True) if el else ""

    def _episode_links(self, soup) -> list[tuple[str, str]]:
        ep_links: list[tuple[str, str]] = []
        for a in soup.select(".ep-panel a"):
            title = a.get("title") or a.get_text(strip=True)
            href = a.get("href", "")
            if href:
                ep_links.append((title, href))
        ep_links.reverse()  # 时间顺序(旧 -> 新)
        return ep_links

    def _build_vod(self, client, vod_id: str, soup) -> dict | None:
        """用已抓到的详情页 soup 组装一部番(含逐集 _get_plays 解析真实播放地址)。"""
        title_el = soup.select_one("h1.names")
        vod_name = title_el.get_text(strip=True) if title_el else ""
        if not vod_name:
            return None

        pic_el = soup.select_one(".detail-poster img")
        vod_pic = pic_el.get("src", "") if pic_el else ""
        if vod_pic and vod_pic.startswith("/"):
            vod_pic = self.base_url + vod_pic

        vod_remarks = self._remark(soup)

        vod_year = None
        vod_area = ""
        for span in soup.select(".detail-left span"):
            text = span.get_text(strip=True)
            if "地区：" in text:
                vod_area = text.replace("地区：", "").strip()
            elif "年代：" in text:
                year_str = text.replace("年代：", "").strip()
                try:
                    vod_year = int(year_str)
                except ValueError:
                    pass

        vod_content = ""
        tabs = soup.find(class_="menu-tabs")
        if tabs:
            active_tab = tabs.find(class_="active")
            if active_tab and "介绍" in active_tab.get_text():
                parent = tabs.parent
                if parent:
                    desc_div = parent.find_next_sibling("div", class_="small")
                    if desc_div:
                        vod_content = desc_div.get_text(strip=True)
        if not vod_content:
            for div in soup.select(".detail-left .small"):
                text = div.get_text(strip=True)
                if (
                    text
                    and not text.startswith("地区：")
                    and not text.startswith("原名：")
                    and not text.startswith("别名：")
                    and not text.startswith("标签：")
                    and "类型：" not in text
                ):
                    vod_content = text
                    break

        # 分类映射
        breadcrumbs = soup.select(".font-2 a")
        type_id = 4
        type_name = "其它动漫"
        if len(breadcrumbs) >= 2:
            t_name = breadcrumbs[1].get_text(strip=True)
            if t_name:
                type_name = t_name
                if "日本" in type_name:
                    type_id = 1
                elif "国产" in type_name or "大陆" in type_name or "国创" in type_name:
                    type_id = 2
                elif "欧美" in type_name or "美国" in type_name or "英国" in type_name:
                    type_id = 3
                else:
                    type_id = 4

        # 逐集请求 _get_plays 拿真实播放地址,按线路(src_site)分组
        lines_dict: dict[str, list] = defaultdict(list)
        for title, href in self._episode_links(soup):
            m_ep = re.match(r"/vod-play/(\d+)/([^.]+)\.html", href)
            if not m_ep:
                continue
            v_id, ep_id = m_ep.group(1), m_ep.group(2)
            plays_url = f"{self.base_url}/_get_plays/{v_id}/{ep_id}"
            self._sleep()
            try:
                plays_resp = client.get(plays_url)
                plays_resp.raise_for_status()
                plays_data = plays_resp.json()
            except Exception as e:
                print(f"Failed to fetch plays for {v_id} {ep_id}: {e}", file=sys.stderr)
                continue
            for play in plays_data.get("video_plays", []):
                play_url = play.get("play_data", "")
                src_site = play.get("src_site", "default")
                if not play_url:
                    continue
                if play_url.startswith("//"):
                    play_url = "https:" + play_url
                elif play_url.startswith("/"):
                    play_url = self.base_url + play_url
                lines_dict[src_site].append((title, play_url))

        play_from, play_url = build_play(list(lines_dict.items()))
        return {
            "vod_id": vod_id,
            "vod_name": vod_name,
            "type_id": type_id,
            "type_name": type_name,
            "vod_pic": vod_pic,
            "vod_remarks": vod_remarks,
            "vod_year": vod_year,
            "vod_area": vod_area,
            "vod_content": vod_content,
            "vod_play_from": play_from,
            "vod_play_url": play_url,
        }

    def _consider(
        self, client, vod_id: str, seen: dict[str, str | None]
    ) -> tuple[str, dict | None]:
        """对单个候选决策:抓详情页 -> 比对备注指纹。

        返回 ("fail"|"skip"|"crawl", vod|None)。只有 "crawl" 才会做昂贵的逐集请求。
        """
        self._sleep()
        soup = self._fetch_detail_soup(client, vod_id)
        if soup is None:
            return ("fail", None)
        if vod_id in seen:
            prev = seen[vod_id]
            cur = self._norm(self._remark(soup))
            # 无指纹 / 当前无备注 / 备注未变 -> 视为无更新,跳过昂贵抓取
            if prev is None or cur == "" or cur == prev:
                return ("skip", None)
            print(f"updated {vod_id}: 「{prev}」-> 「{cur}」,重抓", file=sys.stderr)
        return ("crawl", self._build_vod(client, vod_id, soup))

    def _wrap(self, vod: dict, *, page: int, pagecount: int) -> dict:
        """把单部番包成一份 maccms 响应(list 仅含该部),供逐条入库。"""
        return {
            "code": 1,
            "msg": "ok",
            "page": page,
            "pagecount": pagecount,
            "class": [{"type_id": vod["type_id"], "type_name": vod["type_name"]}],
            "list": [vod],
        }

    # ---------- 流式:逐部产出(断点续采 + 边抓边入库的核心) ----------
    def crawl(
        self,
        *,
        pages: int = 5,
        hours: int | None = None,
        seen_ids: Iterable[str] | None = None,
        **opts: Any,
    ) -> Iterator[dict]:
        seen = self._parse_seen(seen_ids)
        skipped = 0
        client = self._client()
        try:
            if hours is not None:
                # 增量:刷新最近更新,不做 seen 跳过
                ids, pagecount = self._candidate_ids(client, page=1, hours=hours)
                for vid in ids:
                    action, vod = self._consider(client, vid, {})
                    if action == "crawl" and vod:
                        yield self._wrap(vod, page=1, pagecount=pagecount)
                return

            page = 1
            pagecount = pages           # 上界(来自调用方 pages)
            known_total: int | None = None  # 站点真实总页数(解析到才算)
            consecutive_fail = 0
            while page <= pagecount:
                ids, pc = self._candidate_ids(client, page=page, hours=None)
                if pc and pc > 0:
                    known_total = pc
                    pagecount = min(pages, pc)
                # 仅当“无总页数且无候选”才算抓取失败(成功但空页 pc>0 不计)
                if pc <= 0 and not ids:
                    consecutive_fail += 1
                    # 首页就失败(总页数未知)无法安全续抓;或连续多页失败 -> 停止
                    if known_total is None or consecutive_fail >= 3:
                        print(
                            f"第 {page} 页抓取失败(连续 {consecutive_fail} 次/总页数未知),停止",
                            file=sys.stderr,
                        )
                        break
                    # 已知总页数时,跳过本页继续(瞬时失败不截断整轮;漏掉的项下次全量会补)
                    print(f"第 {page} 页抓取失败,跳过继续", file=sys.stderr)
                    page += 1
                    continue
                consecutive_fail = 0
                for vid in ids:
                    action, vod = self._consider(client, vid, seen)
                    if action == "skip":
                        skipped += 1
                        continue
                    if action == "crawl" and vod:
                        yield self._wrap(vod, page=page, pagecount=pagecount)
                page += 1
            if skipped:
                print(f"断点续采:跳过 {skipped} 个无更新的已采集 vod", file=sys.stderr)
        finally:
            client.close()

    # ---------- 批量:满足抽象基类(run.py 实际走上面的 crawl 流式) ----------
    def fetch_page(self, page: int, *, hours: int | None = None, **opts: Any) -> dict:
        seen = self._parse_seen(opts.get("seen_ids"))
        client = self._client()
        try:
            ids, pagecount = self._candidate_ids(client, page=page, hours=hours)
            vods: list[dict] = []
            classes: dict[int, str] = {}
            for vid in ids:
                action, vod = self._consider(client, vid, {} if hours is not None else seen)
                if action == "crawl" and vod:
                    classes[vod["type_id"]] = vod["type_name"]
                    vods.append(vod)
            return {
                "code": 1,
                "msg": "ok",
                "page": page,
                "pagecount": pagecount,
                "class": [{"type_id": k, "type_name": v} for k, v in classes.items()],
                "list": vods,
            }
        finally:
            client.close()

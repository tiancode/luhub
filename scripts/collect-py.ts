import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { syncViaPython, type PythonCrawlOptions } from "../src/collect/python";

interface Args {
  adapter?: string;
  api?: string;
  baseUrl?: string;
  name?: string;
  pages: number;
  hours?: number;
  resume?: boolean; // --no-resume 关闭断点续采(重新全量抓取,已采集的也再抓一遍)
}

function parseArgs(argv: string[]): Args {
  const a: Args = { pages: 5 };
  for (const x of argv) {
    const body = x.replace(/^--/, "");
    const eq = body.indexOf("=");
    const k = eq === -1 ? body : body.slice(0, eq);
    const v = eq === -1 ? undefined : body.slice(eq + 1); // 只按首个 = 切分，保留 URL 查询串
    switch (k) {
      case "adapter":
        a.adapter = v;
        break;
      case "api":
        a.api = v;
        break;
      case "base-url":
        a.baseUrl = v;
        break;
      case "name":
        a.name = v;
        break;
      case "pages":
        a.pages = Number(v);
        break;
      case "hours":
        a.hours = Number(v);
        break;
      case "no-resume":
        a.resume = false;
        break;
    }
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // yhdm 适配器有内置默认 base-url,无需 --api/--base-url 即可运行。
  const needsTarget = args.adapter !== "yhdm";
  if (!args.adapter || (needsTarget && !args.api && !args.baseUrl)) {
    console.error(
      "用法: pnpm collect:py --adapter=maccms --api=<URL> [--name=X] [--pages=N] [--hours=H]\n" +
        "     或: pnpm collect:py --adapter=yhdm --name=樱花动漫 [--pages=N] [--hours=H] [--no-resume]\n" +
        "默认断点续采(跳过该源已采集的 vod_id);--no-resume 可强制重新全量抓取。",
    );
    process.exit(1);
  }

  const yhdmDefault = args.adapter === "yhdm" ? "https://yhdm.one" : "";
  const name = args.name ?? args.api ?? args.baseUrl ?? args.adapter;
  const apiUrl = args.api ?? args.baseUrl ?? yhdmDefault;
  const kind = args.adapter === "maccms" ? "maccms_json" : "html";

  const source = await prisma.source.upsert({
    where: { name },
    create: { name, apiUrl, kind },
    update: { apiUrl },
  });

  const opts: PythonCrawlOptions = {
    adapter: args.adapter,
    api: args.api,
    baseUrl: args.baseUrl,
    pages: args.pages,
    hours: args.hours,
    resume: args.resume,
  };

  console.log(`采集(py) [${name}] adapter=${args.adapter}`);
  try {
    const stats = await syncViaPython(source.id, opts, (m) => console.log(m));
    await prisma.source.update({
      where: { id: source.id },
      data: { lastSyncAt: new Date() },
    });
    console.log(`完成: ${stats.videos} 部影片, ${stats.categories} 个分类条目`);
  } catch (e) {
    console.error(`失败:`, (e as Error).message);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

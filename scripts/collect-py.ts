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
}

function parseArgs(argv: string[]): Args {
  const a: Args = { pages: 5 };
  for (const x of argv) {
    const [k, v] = x.replace(/^--/, "").split("=");
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
    }
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.adapter || (!args.api && !args.baseUrl)) {
    console.error(
      "用法: pnpm collect:py --adapter=maccms --api=<URL> [--name=X] [--pages=N] [--hours=H]\n" +
        "     或: pnpm collect:py --adapter=html_example --base-url=<URL> --name=X [--pages=N]",
    );
    process.exit(1);
  }

  const name = args.name ?? args.api ?? args.baseUrl ?? args.adapter;
  const apiUrl = args.api ?? args.baseUrl ?? "";
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

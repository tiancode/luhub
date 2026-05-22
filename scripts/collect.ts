import "dotenv/config";
import { SOURCES, type SourceConfig } from "../config/sources";
import { syncSource } from "../src/collect/maccms";
import { prisma } from "../src/lib/prisma";

interface Args {
  source?: string;
  all: boolean;
  hours?: number;
  pages: number;
  full: boolean;
  api?: string;
  name?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { all: false, pages: 5, full: false };
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, "").split("=");
    switch (k) {
      case "source":
        args.source = v;
        break;
      case "all":
        args.all = true;
        break;
      case "hours":
        args.hours = Number(v);
        break;
      case "pages":
        args.pages = Number(v);
        break;
      case "full":
        args.full = true;
        break;
      case "api":
        args.api = v;
        break;
      case "name":
        args.name = v;
        break;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let targets: SourceConfig[] = [];
  if (args.api) {
    targets = [
      { name: args.name ?? "adhoc", apiUrl: args.api, kind: "maccms_json" },
    ];
  } else if (args.all) {
    targets = SOURCES.filter((s) => s.enabled !== false);
  } else if (args.source) {
    const found = SOURCES.find((s) => s.name === args.source);
    if (!found) {
      console.error(`未找到资源站: ${args.source}`);
      console.error(`可用: ${SOURCES.map((s) => s.name).join(", ") || "(空)"}`);
      process.exit(1);
    }
    targets = [found];
  } else {
    console.error(
      "用法: pnpm collect (--all | --source=<名称> | --api=<URL> [--name=X]) [--pages=N] [--hours=H] [--full]",
    );
    process.exit(1);
  }

  if (targets.length === 0) {
    console.error("没有可采集的资源站。请在 config/sources.ts 配置后启用，或用 --api 指定。");
    process.exit(1);
  }

  const pages = args.full ? 99999 : args.pages;
  const hours = args.full ? undefined : args.hours;

  for (const t of targets) {
    console.log(`\n采集 [${t.name}] ${t.apiUrl}`);
    try {
      const stats = await syncSource(t, {
        pages,
        hours,
        onProgress: (m) => console.log(m),
      });
      console.log(`完成 [${t.name}]: ${stats.videos} 部影片, ${stats.categories} 个分类条目`);
    } catch (e) {
      console.error(`失败 [${t.name}]:`, (e as Error).message);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

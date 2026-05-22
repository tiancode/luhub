import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { ingestResponse } from "../src/collect/maccms";
import type { MaccmsResponse } from "../src/collect/types";

async function main() {
  const fixturePath = join(process.cwd(), "prisma/fixtures/maccms-sample.json");
  const resp = JSON.parse(readFileSync(fixturePath, "utf8")) as MaccmsResponse;

  const source = await prisma.source.upsert({
    where: { name: "示例资源(fixture)" },
    create: {
      name: "示例资源(fixture)",
      apiUrl: "fixture://maccms-sample.json",
      kind: "maccms_json",
    },
    update: {},
  });

  const stats = await ingestResponse(source.id, resp);
  console.log(
    `Seed 完成: ${stats.videos} 部影片, ${stats.categories} 个分类条目入库。`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

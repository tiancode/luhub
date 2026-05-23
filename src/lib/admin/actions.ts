"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin, setSession, clearSession } from "./session";
import { verifyPassword } from "./auth";
import { runCollect, type CollectOptions, type SourceSnapshot } from "./collect";
import { requestPause } from "./runControl";

// ---------- 鉴权 ----------

export async function loginAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  if (!verifyPassword(password)) {
    redirect("/admin/login?error=1");
  }
  await setSession();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/admin/login");
}

// ---------- 资源站 CRUD ----------

function err(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

export async function createSourceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const apiUrl = String(formData.get("apiUrl") ?? "").trim();
  const kind = String(formData.get("kind") ?? "maccms_json");
  // adapter 仅对 html 源有意义(Python 适配器名,如 yhdm);其它类型置空
  const adapter =
    kind === "html" ? String(formData.get("adapter") ?? "").trim() || null : null;
  const enabled = formData.get("enabled") != null;
  if (!name || !apiUrl) err("/admin/sources", "名称和接口地址必填");

  try {
    await prisma.source.create({ data: { name, apiUrl, kind, adapter, enabled } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      err("/admin/sources", `资源站名称「${name}」已存在`);
    }
    throw e;
  }
  revalidatePath("/admin/sources");
  revalidatePath("/admin");
  redirect("/admin/sources");
}

export async function updateSourceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const apiUrl = String(formData.get("apiUrl") ?? "").trim();
  const kind = String(formData.get("kind") ?? "maccms_json");
  const adapter =
    kind === "html" ? String(formData.get("adapter") ?? "").trim() || null : null;
  const enabled = formData.get("enabled") != null;
  if (!id || !apiUrl) err("/admin/sources", "参数错误");

  // name 创建后不可改：syncSource 按 name upsert，改名会孤立既有采集数据。
  await prisma.source.update({ where: { id }, data: { apiUrl, kind, adapter, enabled } });
  revalidatePath("/admin/sources");
  revalidatePath("/admin");
  redirect("/admin/sources");
}

export async function toggleSourceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const src = await prisma.source.findUnique({ where: { id } });
  if (src) {
    await prisma.source.update({ where: { id }, data: { enabled: !src.enabled } });
  }
  revalidatePath("/admin/sources");
  revalidatePath("/admin");
}

export async function deleteSourceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await prisma.source.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/sources");
  revalidatePath("/admin");
  redirect("/admin/sources");
}

// ---------- 手动采集 ----------

function parseOptions(formData: FormData): CollectOptions {
  const full = !!formData.get("full");
  const pagesRaw = Number(formData.get("pages"));
  const hoursRaw = Number(formData.get("hours"));
  return {
    full,
    pages: Number.isFinite(pagesRaw) && pagesRaw > 0 ? pagesRaw : undefined,
    hours: Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : undefined,
  };
}

function snapshot(s: SourceSnapshot): SourceSnapshot {
  return {
    id: s.id,
    name: s.name,
    apiUrl: s.apiUrl,
    kind: s.kind,
    adapter: s.adapter,
    enabled: s.enabled,
  };
}

async function createRun(sourceId: number, opts: CollectOptions) {
  return prisma.collectRun.create({
    data: {
      sourceId,
      status: "running",
      pages: opts.full ? null : opts.pages ?? 5,
      hours: opts.full ? null : opts.hours ?? null,
      full: opts.full ?? false,
    },
  });
}

export async function runCollectAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) redirect("/admin/sources");

  const opts = parseOptions(formData);
  const run = await createRun(source.id, opts);
  const snap = snapshot(source);

  // 响应后继续执行（即使下面 redirect 也会跑完），结果写入 CollectRun。
  after(async () => {
    await runCollect(run.id, snap, opts);
  });

  revalidatePath("/admin/sources");
  revalidatePath("/admin");
  redirect("/admin/sources");
}

export async function collectAllAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const opts = parseOptions(formData);
  const sources = await prisma.source.findMany({ where: { enabled: true } });
  if (sources.length === 0) err("/admin/sources", "没有启用的资源站");

  const jobs: { runId: number; snap: SourceSnapshot }[] = [];
  for (const s of sources) {
    const run = await createRun(s.id, opts);
    jobs.push({ runId: run.id, snap: snapshot(s) });
  }

  // 串行执行，避免并发写 SQLite。
  after(async () => {
    for (const job of jobs) {
      await runCollect(job.runId, job.snap, opts);
    }
  });

  revalidatePath("/admin/sources");
  revalidatePath("/admin");
  redirect("/admin/sources");
}

export async function pauseCollectAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const runId = Number(formData.get("runId"));
  if (runId) {
    // 运行中 -> 立即 abort(子进程被杀 / 页间停止);其 runCollect 随后会写入“已暂停”+部分统计。
    requestPause(runId);
    // 同时落库 paused:让“采集全部”队列里尚未轮到的任务被跳过,且 UI 立即反映。
    await prisma.collectRun.updateMany({
      where: { id: runId, status: "running" },
      data: { status: "paused", finishedAt: new Date() },
    });
  }
  revalidatePath("/admin/sources");
  revalidatePath("/admin");
  redirect("/admin/sources");
}

// ---------- 分类映射 ----------

export async function repointCategoryMapAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const categoryId = Number(formData.get("categoryId"));
  if (!id || !categoryId) redirect("/admin/categories");
  await prisma.categoryMap.update({ where: { id }, data: { categoryId } });
  revalidatePath("/admin/categories");
  revalidatePath("/list");
  redirect("/admin/categories");
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const group = String(formData.get("group") ?? "other");
  const sortOrder = Number(formData.get("sortOrder")) || 0;
  if (!id || !name) redirect("/admin/categories");
  await prisma.category.update({
    where: { id },
    data: { name, group, sortOrder },
  });
  revalidatePath("/admin/categories");
  revalidatePath("/list");
  redirect("/admin/categories");
}

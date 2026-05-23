// 进程内的采集任务取消注册表。自托管单进程下,Server Action(暂停)与 after() 后台任务
// (采集)共享同一模块实例,故可用内存 AbortController 协作式暂停。
// 暂停 = 对运行中的任务发 abort:采集在分页/逐条处停止,**已入库的数据保留**;
// 再次「开始采集」会经断点续采从中断处继续。
const controllers = new Map<number, AbortController>();

/** 任务开始时登记,返回其 AbortSignal(传给 syncSource / syncViaPython)。 */
export function beginRun(runId: number): AbortSignal {
  const ctrl = new AbortController();
  controllers.set(runId, ctrl);
  return ctrl.signal;
}

/** 任务结束(成功/失败/暂停)后注销。 */
export function endRun(runId: number): void {
  controllers.delete(runId);
}

/** 请求暂停指定运行;返回是否命中正在运行的任务。 */
export function requestPause(runId: number): boolean {
  const ctrl = controllers.get(runId);
  if (!ctrl) return false;
  ctrl.abort();
  return true;
}

/** 该运行是否仍在进程内活动(尚未 endRun)。续采前用它避免与正在收尾的旧任务抢同一 runId。 */
export function isRunActive(runId: number): boolean {
  return controllers.has(runId);
}

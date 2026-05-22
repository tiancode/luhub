"""LuHub 采集器（Python）。

职责：抓取 + 解析，把结果归一化为 maccms 形状的 JSON，输出到 stdout，
由 TS 侧的 `ingestResponse`（src/collect/maccms.ts）负责写库。
所有写库 / 分类映射逻辑只留在 TS 一处，Python 专注抓取解析。
"""

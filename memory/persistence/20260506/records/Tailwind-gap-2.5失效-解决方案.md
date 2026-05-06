# Tailwind `gap-2.5` 失效问题

## 日期

2026-05-06（迁移整理）

## 背景

使用 Tailwind 时发现 `gap-2.5` 不生效，需要明确原因与最简修复方式，避免反复踩坑。

## 结论 / 事实

- Tailwind 默认 spacing scale 以 `0.25rem`（4px）为步进，但只包含**整数级**（`gap-0/1/2/3/4...`），`2.5`（10px / 0.625rem）不在默认配置中。
- **最简解**：Tailwind v3+ 使用 Arbitrary Values（任意值）语法：
  - `gap-[10px]`
  - `gap-[0.625rem]`

## 影响 / 下一步

- 统一约定：遇到非默认 scale 的间距，优先用 `gap-[...]`（或在 tailwind config 扩展 spacing 后再用语义化 class）。

---

## 附录：原文（从 `docs/knowledge/Tailwind失效.md` 迁移）

原因说明：
Tailwind 默认的 spacing scale 是基于 0.25rem（即 4px）的倍数，但只包括整数倍，例如：
gap-0 → 0
gap-1 → 0.25rem（4px）
gap-2 → 0.5rem（8px）
gap-3 → 0.75rem（12px）
gap-4 → 1rem（16px）
...
所以 2.5（对应 0.625rem 或 10px）不在默认的 spacing 配置中。
解决方案：
✅ 方法一：使用任意值（Arbitrary Values）（Tailwind v3+ 支持）
你可以直接使用方括号语法来指定任意 gap 值：
html

预览



<div class="grid gap-[10px]">...</div>
<!-- 或 -->
<div class="flex gap-[0.625rem]">...</div>
这是最简单的方式，无需修改配置。

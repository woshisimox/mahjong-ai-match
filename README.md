# Mahjong AI Match v3.3.3d

- 单实例 API Key 面板
- 外部 AI 调用 + 审计日志优先显示
- 出牌理由写入日志
- 相邻重复日志去重


## 四川血战到底（后端规则逻辑）

已新增后端规则支持：**吃（CHI）/碰（PENG）/杠（GANG/ANGANG/BUGANG）/胡（HU）** 与 **血战到底** 流程。
新增文件：

- `lib/types.ts`：动作、状态与类型定义
- `lib/rules/sichuan.ts`：四川血战到底规则（反应判定、优先级、吃碰杠应用、自摸/荣和判定）
- `lib/mahjongEngine.ts`：导出 `initTable_SCZDXZ` / `getReactionsAfterDiscard` / `priorityResolve` / `applyMeldAction` / `onDrawPhase` / `discardTile` 等
- `pages/api/rules.ts`：给前端/外部调用，用于对 `lastDiscard` 触发后的可选动作计算与优先级解析

### 集成方式（前端最少改动思路）
1. 用 `initTable_SCZDXZ(['A','B','C','D'], dealerIndex)` 初始化一手。
2. 轮到某位玩家摸牌 → 调用 `onDrawPhase(state, seat)`；如果 `win` 有值即自摸，调用 `markWinner` 并继续血战。
3. 玩家打出一张牌 `discardTile(state, seat, tile)` → `POST /api/rules` 携带 `state`，拿到 `resolved`。
   - 若 `resolved` 中有人 `HU`：逐家 `markWinner`；否则若 `PENG/CHI`：调用 `applyMeldAction` 执行吃/碰并让该玩家继续出牌。
4. 没有任何反应 → 顺位到下一位（跳过已胡的玩家）。
5. 直到 `state.roundActive === false` 或 `wall` 为空。

> 注：当前计番为简化版（平胡、七对、清一色叠加），方便先把流程跑通；细节番型可在 `rules/sichuan.ts` 扩展。


### 规则可选：136 张（BASIC）/ 108 张（四川·血战到底）
- 使用 `initTable('BASIC', players, dealer)` → 136 张（含东南西北中发白）
- 使用 `initTable('SCZDXZ', players, dealer)` → 108 张（无字牌）
- 也可用 `generateWall136()` / `generateWall108()` 或通用 `generateWallByRule(includeHonors)` 生成牌墙。

前端可通过一个下拉框选择规则模式，并把所选值用于初始化。

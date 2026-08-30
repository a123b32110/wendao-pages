# 问道：今日踏仙路

> **原始專案／出處**
>
> 本倉庫基於 [ypyik0669/wendao](https://github.com/ypyik0669/wendao) 改作；原作者為 [ypyik0669](https://github.com/ypyik0669)。本版本新增 GitHub Pages 單機遊玩適配。
>
> 原始程式碼著作權歸原作者所有，並沿用倉庫內的 [MIT License](./LICENSE)。

> 从凡人到仙人。挂机修炼、渡劫、游历奇遇、炼丹炼器、论道竞技、宗门、世界 BOSS、赛季榜单、寿元与轮回。

## 怎么玩

1. **定道号、测灵根**：灵根决定修炼速度（天灵根 ×2.0 … 杂灵根 ×0.8），开局可免费重掷三次。
2. **修炼是时间**：离线也在修炼（上限 12 小时，布下聚灵阵可延至 24/36 小时）。每 10 分钟可「吐纳」一次加速。
3. **突破是选择**：修为满后可突破。小境界看成功率，失败会走火入魔；**大境界要渡劫**——劫雷逐道落下，你选择硬抗 / 招架 / 御剑 / 祭法宝 / 避雷符 / 定心丹，最后一道是心魔。失败：重伤、跌境、折寿十年。
4. **游历是发现**：五个地域随境界解锁。事件像小说旁白，有选项、有后果、有伏笔，也有妖兽。体力每半小时回 1 点、上限 10（辟谷丹每日可再续两次共 10 点），每日至多 20 次。
5. **筑基后择道途**：剑修 / 法修 / 体修 / 丹修 / 阵修 / 符修 / 器修 / 驭兽师 / 邪修。金丹后可兼修副业：商人 / 探险者。身份由宗门决定：散修 / 弟子 / 长老 / 掌门。
6. **论道**：每日 5 次异步切磋，点到为止。论道值（Elo）与赛季积分，赛季 30 天一期。
7. **宗门**：金丹后可开宗立派（5000 灵石）。捐献与宗门试炼积累贡献，宗门升级后全员修炼加成。
8. **世界 BOSS**：每日一只，伤害按自身境界折算，全服同榜，次日按名次领赏。
9. **丹毒**：服丹会积毒。过 40 修炼 ×0.85，过 70 ×0.6，满 100 便再不能服丹。每日自退 10 点，清毒丹清 40 点，丹修积毒减半。根骨卡上随时可查。
10. **寿元**：1 真实日 = 3 岁。寿元随境界增长，折寿会来自渡劫失败与邪道。寿尽坐化后可带着「道统」转世。
11. **秘境**（游历页）：每日两次入秘境，每层从两三条路里选一条（妖兽/精英/宝箱/奇遇/药泉/行商/陷阱/机缘），气血不回、机缘只在此行有效；随时「收手」把战利品带走，倒下只剩一半。最深层的秘境之主掉「秘境晶核」。周榜比最深层。
12. **法宝淬炼**（行囊·法宝）：重铸一条词缀（可选「保值」：费用翻倍，属性不变、数值只升不降）、两件同名法宝升星、镶嵌符纹（槽数随品阶）。
13. **灵田药圃**（洞府）：播种后 2-8 小时成熟，途中随机虫害/干旱/灵气紊乱/灵雀偷食，两小时内处理否则减产，两次受损枯萎。收成是炼丹材料，一成概率变异成高一阶。
14. **灵兽**（行囊·灵兽）：孵蛋、派去各地远行 4/8/12 小时带回材料（偶得蛋与奇遇）、喂材料升级、10/20 级进化。战斗中灵兽替你挡下一成五伤害（挡得动多少取决于它自己剩多少血），倒下后停手，每小时回满。灵兽算进战力。
15. **五行连珠**（论道·棋局）：6×6 五行棋盘，交换相邻两子，横竖三子以上按相生顺序相连即消。每日一局计分（全服同盘），练习不限。
16. **悬赏与成就**（道册）：每日三张悬赏按今日所为自动计数，领取给灵石与材料；三张皆结悟性 +1，连续七日得宝匣。三十条成就跨转世累计，部分附带称号。
17. **宗门建设**（宗门）：库藏来自成员贡献；掌门与长老可升藏经阁（修炼）/丹房（炼制）/护山大阵（试炼与守御）/聚灵池（每日俸禄）。本周宗务三条目标（捐献贡献 / 试炼出手次数 / 论道胜场）由全员合力，下周登录自动发赏。
18. **上界**：化神后开「九天罡风层」，大乘后开「太虚古战场」，各有新妖兽、新事件与第五阶材料/丹药/法宝。

## 公平性

- 页面只发送"意图"，**所有结果都由服务端裁决**：战斗、掉落、天劫、拍卖、论道。
- 每个共享区键只有一个写入者（自己的快照、自己的出价、自己的伤害），排行榜由读取者现算。拍卖由定时任务落槌。
- 能量（论坛积分）只在里程碑发放：首次筑基 +2、金丹 +3、元婴 +5、飞升 +10；赛季论道前三 +5/+3/+1。每账号每种一次，每天最多一次。

## 权限说明

| 权限 | 用途 |
|---|---|
| kv | 角色、行囊、传记、道统 |
| kv.shared | 公开快照、论道记录、宗门（含建筑与周务）、拍卖、BOSS 伤害、连珠日榜 |
| points | 里程碑能量奖励（只发放，金额极小） |
| schedule | 每 10 分钟一次的定时任务：拍卖落槌、宗门汇总、过期数据清理、赛季结算 |
| triggers | `post_created` / `post_liked`：当日在论坛发帖或点赞，游戏内获得一次「论道日课」奖励 |

## 两种界面

- **blocks（默认，已在真站 playtest 验证）**：整个游戏用平台原生组件渲染，无需额外审批。标题横幅、境界印、地图卡用 `image` 组件显示——平台只接受本站/上传域名的图片（data: URI 会被 E_INVALID_BLOCKS 拒绝），所以用 `tools/art-render.mjs` 生成 PNG，再用 `tools/art-upload.mjs`（走已登录的 Chrome 会话上传到论坛）写出 `lib/ui/assets.js`。按钮动作语法 `tab:<页签>` / `sub:<子页>` / `do:<方法>[:<参数>]`，输入框按 `name` 透传。
- **webview（正式版）**：同一套引擎的精致版页面（夜青鎏金仙侠主题、境界法印、场景横幅、渡劫 canvas、战斗回放动画），页面通过 `window.community.call(method, params)` 调用，结果从返回体的 `result` 字段取。注意三条实测规则：① playtest 草稿永远以 blocks 降级显示，`nodeloc-apps upload` 后（本站自动审核通过）卡片才切到 webview；② webview 的 `webview()` 返回值取自**已发布版本**，playtest 推送不会更新它；③ 页面被嵌在 `srcdoc` iframe 里，CSP 为 `img-src data: blob:`、`style-src 'unsafe-inline'`——图片只能用 data-URI（所以 webview 的美术是内联 SVG，见 `lib/ui/artsvg.js`），Google Fonts 会被拦截（依赖系统楷体/宋体回退）；④ iframe sandbox 没有 `allow-modals`，`confirm()/prompt()/alert()` 被静默忽略（confirm 恒 false、prompt 恒 null），所有确认/输入必须用页内弹窗（`sure()/ask()`）。

## 美术资源

全部美术由代码生成（`tools/art-render.mjs` 画 SVG → headless Chrome 出 PNG），再经论坛上传得到站内 URL（平台只允许本站图片）。键名约定：`banner_<tab|guest|create>`、`seal_<境界序号>`、`region_<地图id>`、`mon_<妖兽id>`、`item_<物品id>`。webview 通过注入的 `A` 常量读取，blocks 通过 `lib/ui/art.js`；缺图时两边都静默降级为无图。

## 开发者

源码在 `lib/`，`tools/build.mjs` 把它们拍平成 `src/main.js`（平台只接受单模块，且 CLI 只能内联树状导入）。拍平时 `tools/strip.mjs` 会去掉服务端代码的注释、缩进与标点旁空格（字符串与模板字面量原样保留，所以 webview 客户端不受影响）；`test/build.test.mjs` 保证打包后的 webview 输出与 `lib/` 一致，`WD_BUNDLE=1 node --test test/*.test.mjs` 可让整套测试跑在打包产物上。包体上限 512 KB。

```bash
node tools/build.mjs && nodeloc-apps dev   # 打包 + 静态检查
node --test test/flows.test.mjs test/blocks.test.mjs test/client.test.mjs   # 流程 / blocks / jsdom 页面
node tools/preview.mjs 8787 && node tools/shot.mjs   # 本地预览 webview 并截图（无需登录）
node tools/art-render.mjs && node tools/art-upload.mjs [regex]   # 生成并上传美术资源（横幅/境界印/地图/妖兽/物品），写出 lib/ui/assets.js
node tools/shot-trib.mjs                    # 渡劫画面截图（需 preview 运行中）
node tools/play.mjs full|explore|mobile|buttons     # 用已登录的 Chrome 在真站 playtest 上自动走查（截图在 %LOCALAPPDATA%/Temp/claude/wendao-browser-out）
node tools/play-full.mjs [url]               # 完整真机剧本（创角→渡劫→…→秘境/灵田/灵兽/连珠/道册→转世，需作者账号的 dev.* 指令）；传 http://localhost:8790/?uid=26651 可跑本地 preview（preview 需 WD_DEV_UID=26651）
node tools/shot-v6.mjs                      # v6 各新页面截图（需 preview 在 8790）
node tools/sim-v6.mjs 14                    # 12 人 × N 天全循环模拟（经济/抛错）
node tools/sim-dungeon.mjs                  # 秘境各境界通关率（目标：寻幽 75-90%、绝境 15-40%）
node tools/sim-pet.mjs                      # 灵兽值多少战力（改 PET_SHARE / PET_BITE 后校准）
node tools/sim-boss.mjs                     # 各头世界 BOSS 的威能离散度与回合数
N=24 node tools/sim-wuxing.mjs              # 连珠三档玩家水平的得分与奖励到达率
node tools/balance.mjs                      # 修炼日历
node tools/sim-battle.mjs                   # 战斗胜率
node tools/loadtest.mjs 2000                # 2000 玩家共享区下的调用耗时
```

### 首次 playtest 验证清单（平台文档未写明的部分）

打开页面后若看到「无法连接」卡片，把卡片里的原始返回贴给开发者——客户端 `unwrap()` 依次尝试 `.state.__v` / 整对象 / `.data` / `.result` / `.view`。

1. `onMessage` 的返回如何到达页面（预期 `state`）。
2. 沙箱里 `Date.now()` 可用（洞府页"修为 +x/时"与离线结算是否正常）。
3. 单个 kv 值上限（行囊塞满后是否还能保存）。
4. `schedule.add` 同名 `job_key` 是否去重（`nodeloc-apps logs` 里 `onSchedule` 的频率应约为 10 分钟一次）。
5. `onTrigger` 的 `ctx.user` 是否存在（发一帖后游戏内应出现「论道日课」）。
6. webview 的 CSP 是否允许内联样式与 `<canvas>`（渡劫画面）。

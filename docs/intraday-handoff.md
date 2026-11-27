# 工作状态速记

用途：后续优先读本文件和待改文件，减少重复上下文读取。用户要求每步自检后精简汇报。

- 仓库 `C:\Users\34877\Documents\GitHub\M-quant`；部署脚本 `E:\M-quant\Start-MQuant.ps1`、`Stop-MQuant.ps1`。Python `E:\M-quant\.venv\Scripts\python.exe`；Node `E:\M-quant\runtime\node\node.exe`。
- 本地服务 `http://127.0.0.1:5555`。盘中已扩50只、日线50只各自独立。
- 主文件：`tools/intraday_probe.py`采集；平台`intraday-trial.mjs`控制器、`intraday-policy.mjs`超时调度、`intraday-validation.mjs`连续验收；assets同名页面模块与`intraday-charts.js`。
- 50只配置 `platform/quant-factor-platform/config/intraday-trial.json`；本轮用户授权执行第一步，automatic_enabled=true。交易时段60秒目标，超时120/180秒、硬终止后5分钟冷却，连续两轮新鲜且时间推进恢复。服务需运行，网页可关。
- 真行情：两路报价/盘口，分钟东财失败可切新浪，10只当日2380条；闭合语义未验证。图表缺口断线，缓存有标识，不混来源。
- 自动采集已部署，但截至11月24日盘后尚无真实自动盘中稳定性记录，不能承诺分钟达标。新增连续验收报告保存到outputs/live-market-data/intraday-trial/validation/，数据不提交Git。
- 最新50只采样 `20261124T223949-917bacf8`，报价阶段1.062秒，整轮31.422秒，两路报价各50/50、分钟50/50共11900条；盘后手动记录排除在达标率外。详见intraday-50-step1-20261124.md。实际访问接口0.6秒限速，冷却来源不重复等待。交易状态未知。
- 测试：Python31项、Node43项本轮全通过，实际50只图表生成与切换核对通过。未通过CUA检查整页（本地浏览器不可用）。
- 无AGENTS.md发现。多处用户既有未提交改动，勿清理或覆盖。所有本轮改动均未提交/推送。
- 下一步：在当前50只完成真实盘中≥30分钟/≥30轮验收；基础门槛99%完整新鲜、95%一分钟目标含缺轮，达标仅供复核；不把盘后31秒当稳定性证据。
- 新增独立自动采集监控面板，图表上方：assets/intraday-monitor.js；后台返回last_tick_at与next_session_at。自动/手动、进度、下一次倒计时、今日自动轮数、时间线可见。Node50项通过；实际休市等待且自动0轮，下一时段11月25日09:30；详见intraday-monitor-20261124.md。

- 第二步第一批已部署（详见intraday-step2-batch1-20261124.md）：`GET /market-data-api/intraday/summary`摘要155.2KiB，旧完整状态2042.1KiB，减少92.4%；`/intraday/minute?code=000001`单股38.3KiB。前端仅选中股按版本加载，未变化复用图形；旧缓存不沿用新鲜状态和接收时间。
- 新增`tools/intraday_storage.py` SQLite旁路存储（`runtime/intraday.sqlite`）、分钟元数据侧文件、`status-light.json`。仍用原缓存读图；库错不影响有效行情，但无写入补偿队列。版本来自source/code/adjust/rows，忽略派生age。闭合正式表不写入。
- 最近真实盘后手动轮`20261124T233230-bf144056`：报价1.218秒、全轮31.39秒；50/50报价与分钟，53次外部请求（未减少）、2次冷却跳过；50序列/11900条数据库一致，完整性ok，正式闭合0。日线run保持20261124T190516-306c745a。Python39、Node54全部通过，真实API+页面节点模拟通过，无浏览器整页视觉检查。
- 产物`qa/batch1-selfcheck.json`与`qa/batch1-panel-check.json`。下一批先小样本分钟标签/闭合语义与冲突缺口核查，再切正式读源、常驻进程和历史补采队列；盘中连续验收仍待实际交易时段。全部本地未提交，勿覆盖既有改动。

- 第二步第二批已部署（2026-11-25，详见intraday-step2-batch2-20261125.md）：`tools/intraday_minute_audit.py`复用现有数据，config.minute_audit_codes限定000001/000002/000063。`minute-audit/`详情+每股30条近期摘要，`minute-audit-baselines/`来源隔离基线；重复拒收、乱序记录、同源修订、内部疑似缺口（排除午休及未知边界）、同分钟可能形成中、旧接收/时间倒退保护；不确认闭合、不补零、不启动补采。
- 页面新增`assets/intraday-audit.js`“分钟标签与缺口核查”，摘要接口含3只审计详情但去掉历史；历史/版本不匹配不计本轮。正式闭合仍0。
- 最新主手动轮`20261125T124850-25955b50`午休：50/50报价与分钟，报价0.781秒、总34.75秒、55外部请求；东财26股+新浪24股，共6026条库缓存一致，完整性ok。3只东财各121条09:30—11:30、内部疑似缺口0。隔离QA复查`20261125T125027-320f493b`额外8请求走新浪各120条09:31—11:30；09:30边界来源差异不能当漏数/已闭合。未观察真实形成过程。日线run本次前后均20261125T042924-a38c6f6f。
- 最终Python48、Node58通过，真实API+页面节点联调通过（无浏览器视觉QA）；产物qa/batch2-selfcheck.json、batch2-panel-check.json、batch2-sourcecheck.json。下一步先积累3只盘中边界/修订证据，核实来源口径，再正式读源和独立补采队列；不要声称已完成可靠闭合K线、常驻采集或分钟持续达标。自动开关仍true。

- 展示已整合为左侧独立“数据采集中心”（`/#data-collection`），详见data-collection-center-20261125.md。新增assets/data-collection.js统一挂载；index原常驻顶部两面板移入data-collection-view，分采集监控/行情图表/质量与记录/日线更新四页。app.showView发platform:viewchange事件，处理独立入口片段。
- market-data.js与intraday-trial.js新增可见性回调并返回refresh接口；离开中心停止前端轮询，回到时立即刷新；只在图表页取所选股票分钟序列。后端调度不变。58项Node回归与实际HTML+本地API分页联调通过；qa/collection-center-selfcheck.json。未做浏览器截图验收、未重复跑Python或抓行情。所有改动仍本地未提交。

- 13:31诊断（intraday-source-diagnosis-20261125.md）：13:00—13:27共10轮自动两路报价50/50，但分钟8轮0/50、2轮13/50。新浪HTTP200实际13:31:48响应含13:32标签，整段未来校验拒收并全来源冷却；两份响应隔离尾部1条后151条当日样本通过（仍未闭合）。东财环境ProxyError、直连ConnectionError，不能断言只代理/限流。13:29:56自动已被暂停，本轮只诊断未改开关/程序。qa/source-diagnosis-20261125/selfcheck.json保存证据。建议下一步严格隔离下一分钟候选、拆分网络/校验/限流与冷却范围，再3→10→50盘中验收；目前修复未上线，不能声称分钟已恢复。

- 上述修复已实施（intraday-recovery-20261125.md）：新浪仅允许交易时段原响应尾部恰为下一分钟边界的1条候选进入pending_rows，仍校验OHLC/重复；rows不含未来候选、库与图表version也排除它们。全部仍未闭合。失败分类validation/network/rate_limit/local/cooldown/circuit_skip，单股校验不全源冷却，网络/429仍退避。config.minute_source_order已为sina/eastmoney；自动仍false。
- 受控真实盘中3只1.719秒/10只6秒均完整，隔离QA；主50只手动run20261125T134000-0102d978完整50/50，30.61秒、52请求、0失败/跳过、22条尾部候选隔离、8000条库缓存匹配，完整性ok、正式闭合0。日线run本次前后20261125T125649-f838d57a。Python55/Node60通过，页面API+节点联调通过。qa/recovery-selfcheck-20261125.json、recovery-panel-check-20261125.json。不得声称连续稳定或自动已恢复；自动仍暂停，东财连接未修复。

- 连续验收已完成（intraday-continuous-20261125.md）。进入本轮时自动已被开启；发现13:45状态JSON替换WinError5导致进程退出，已在market_data_refresh.atomic_json加7次有界重试（总等待≤0.775秒）、保留旧完整JSON并清理临时文件。真实Windows读者占用测试0.181秒通过。
- 新增独立validation session：controller.beginValidation/validationSession，POST /intraday/validation-session，GET /intraday/validation?session=1；报告collection_profile=minute-recovery.v2:来源顺序，按时间/版本筛选，配置改变阻止达标，全天历史失败保留。质量页可开始新窗口并分别下载当前/全天报告。Python58/Node62通过，无浏览器视觉QA。
- 固定窗口session 46f1b580-dc3a-4a36-bcda-d7ef0d4f211b：13:55:29—14:25:49启动、14:26:24结束，31自动轮/30.3分钟，31轮均50/50且新鲜、0缺轮、0来源失败、1612外部请求；2轮advanced=false（14:02:35和14:23:48），一分钟目标29/31=93.55%未达95%，不能声称验收通过。全流程P50/P95/max=32.061/33.721/35.224秒，分钟源标签差P95=80.246秒。31轮1550序列/295097行次库缓存匹配，完整性ok、正式闭合0。窗口后又有未推进，后续必须继续核查，不能只延长窗口稀释失败。
- 结果存validation-sessions/<session-id>-result.json及qa/continuous-window-result-20261125.json，observer进程已停止，后台采集仍开启并按60秒运行。下一步优先逐股源时间诊断和有限复查，再验收；未做历史补采队列或确认分钟闭合。全部本地未提交。

- 用户最新明确范围：只做逐股诊断、定向恢复，第三部分连续统一验收待更多改动后再做，不要擅自启动/重置30分钟验收。本批详见symbol-diagnostics-recovery-20261125.md。
- 新增tools/intraday_diagnostics.py：来源/类型/股票隔离基线，逐股源时间/接收时间/内容hash及最新值，区分标签未变仍修订、标签与内容均未变、倒退及错误。targeted_recovery默认每轮3目标/4额外请求、180秒目标冷却、2秒观察、50秒启动预算；共享原来源限速/冷却。只复查停滞目标；分钟须新标签更晚且≤180秒才整段替换选用，报价按同源小批量复查并merge receipt_by_code；不放宽闭合规则。
- 分钟原/复查检查新增selected；所有controller、recoveryQuality、validationRecord和页面覆盖选择selected!==false，避免仍读初次响应。assets/intraday-diagnostics.js新增质量页诊断表与复查过程，可切需关注/全部。source profile升级symbol-recovery.v3:来源顺序，旧窗口提示配置变化，本批没有创建新窗口。
- Python68/Node66全部通过；真实收盘后短轮20261125T150019-97ddf804，50/50，32.344秒/52外部请求/150诊断/0额外复查，50序列11885条库缓存一致、完整性ok、正式闭合0。实际API+页面节点联调通过，无浏览器视觉QA。恢复成功分支仅隔离场景验证，不宣称盘中真实恢复或长期达标。qa/symbol-diagnostics-selfcheck-20261125.json、symbol-diagnostics-panel-20261125.json。
- 调试时曾短暂停自动触发，现已恢复原enabled=true，收盘后正常等待下一交易时段。旧固定验收id及结果保留；未做新的连续验收或历史补采队列。全部本地未提交。

- 下一阶段已做独立补采队列第一批（intraday-backfill-20261125.md）：tools/intraday_backfill.py独立SQLite jobs/observations/attempts/budgets，3只audit样本按同源当日内部疑似缺口去重排队。边界相邻待复核、跨日needs_historical_source，不造数据、不称已闭合。候选只写backfill.sqlite，不替换最新cache/主行情DB。
- 休市且日历确认时独立子进程每分钟最多一项/一次请求，日20次，待执行100项，每任务3次（含中断预占），失败5分钟等待；租约过期重排。共享运行锁、来源冷却/last_request_at及0.6秒间隔。最新任务/交易开始会终止补采并等待退出，20秒看门狗。controller新增startBackfill/setBackfillEnabled，POST /intraday/backfill，质量页assets/intraday-backfill.js。
- 当前真实两项000002/000063的14:58—14:59紧邻收盘，标needs_boundary_review，正式补采0请求/0候选，不误报已补齐。Python82/Node72通过，真实Windows模拟进程接管约1.079秒/0行情请求；隔离复制真实缓存故意移除13:02后一次同源请求成功取回待核实候选，仅QA。主run20261125T150019-97ddf804、100缓存hash、原验收id均不变，正式闭合0。
- qa/backfill-selfcheck-20261125.json及backfill-panel-check/backfill-process-priority/backfill-isolated-fetch-20261125.json保存证据。最新自动与补采均enabled=true，当前休市；未启动新统一连续验收。未接跨日历史来源/长期行情常驻进程/可靠闭合K线。全部本地未提交，无浏览器视觉QA。

- 股票数据管理库第一批已部署（stock-library-management-20261125.md）：stock-library.mjs/ assets/stock-library.js /tools/stock_library.py，config/stock-library.json统一名单，输出stock-library-history版本历史和pool-config-snapshots不可变工作配置；控制器及Python CLI投影日线/报价/分钟/核查/priority。可搜索编辑、批量加入默认不采集、预览/保存、版本冲突拒绝、恢复生成新版本。第5分页“股票数据管理库”。报价1—50、核查≤3，分钟可独立关闭。
- 用户授权的替换示例已执行：60只管理库（原50+600519/600036/601318/600276/600887/601398/600900/601888/601012/600030），v1原名单、v2停采000002万科A/000876新希望，启用600519贵州茅台/600036招商银行，日线/报价/分钟各50；audit=600519/000001/000063。原股票历史保留，000002补采任务paused_removed，重加会恢复核对。
- 两路批量报价验证10股，两股分钟验证成功；替换后主短轮20261125T155910-17be0bb8，pool_version2，50/50，31.062秒/52请求/11900条库匹配/正式闭合0。新股日线尚无缓存，daily状态按pool_hash标stale并阻止旧信号当新池结果，需下一次日线更新准备（原18:30计划仍在）。原日线run未动、停采股4缓存hash未变、原验收id未变。Python86/Node81通过，无浏览器视觉QA。
- 当前实时配置改以管理库为准，旧intraday codes与daily symbols_file为迁移保留；不要只改旧名单以为已生效。每轮snapshot固定版本，运行期间状态保留该轮code/minute/audit，下一轮生效；验收按pool_version隔离，统一验收继续推迟。qa/stock-library-selfcheck/sourcecheck/panel-check/before-smoke-20261125.json保存证据。自动开关仍开启，全部本地未提交。

- 换股后历史准备已部署（stock-history-preparation-20261125.md）：tools/stock_history_prepare.py + history-preparation.mjs，管理库显示历史准备进度、条数/日期/失败/疑似缺口；保存名单后自动排查，休市分批最多3只，交易日09:25—15:05含午休让路，共享日线写锁。失败30分钟后重试，同版本北京日期每天最多3个自动失败批次；可暂停，草稿禁手动执行。缓存与要求变化撤销回执，每批固定股票池版本。
- 新增严格history-start.v2校验：腾讯600036曾返回640条但只始于2024-04-03，已修复为起点不覆盖则拒收并切源；最新运行20261125T162525-652143d4复用49只、重补1只，2.593秒。当前600519与600036各700条，2024-01-02—2026-11-24，50只基础校验通过共34970条。002049/002129/002812各10个内部日期待核查，不断言停牌/漏数或已补齐。
- 历史准备仅改日线单股缓存与独立history-preparation回执，不发布整个池快照/信号；原日线状态、分钟状态与缓存106文件hash保持；原验收ID不变，自动与分钟补采仍true。16:30目标日期切换后历史可“已校验”而日线“待更新”，属预期。Python99/Node90通过，真实HTML/API/节点联调通过，无浏览器视觉QA；qa/history-preparation-selfcheck-20261125.json保存证据。本批无新统一连续验收，正式闭合仍未确认；全部本地未提交。

- 历史缺口核查第一批已部署（daily-gap-review-20261125.md）：tools/daily_gap_review.py，复用history-preparation控制器增加review-daily-gaps操作，股票管理库显示缺失日期/来源/窗口/失败/价格差异。按钮触发，最多3股/批、12次来源尝试/北京日期，30分钟后可复查未成功来源；共享日线锁与最新任务让路。独立daily-gap-review证据与候选，不写主行情，旧基线变化后标stale，不把共同缺失当作已确认停牌。
- 真实run20261125T164222-e3679aba，43.187秒/4次来源尝试：腾讯3成功，东财1次ProxyError并冷却。002049缺2025-12-30—2026-01-14、002129缺2026-11-02—11-13、002812缺2025-12-01—12-12，各10个交易日；腾讯与新浪均缺这30日，0补回。恩捷前后2025-11-28/2025-12-15价格差异待核实复权，不判谁错。其他来源没有有效证据，原因尚未确认。
- Python110/Node95通过，真实HTML/API/节点联调通过，重复点击不加请求、旧版本拒绝。主行情/状态与原验收结果211文件hash不变；v2、自动与分钟补采enabled、原验收ID均保留。qa/daily-gap-selfcheck-20261125.json与daily-gap-before-20261125.json留证。没有浏览器视觉QA或新连续验收，全部本地未提交。下一步可用公告/明确停牌证据核实这些日期与复权基准，再决定是否允许采纳候选；不要将本次无候选写成已修复。

- 主线已回到盘中分流第一批（intraday-split-batch1-20261125.md）：config.split_collection.enabled=true，报价15秒目标、分钟60秒目标；split-intraday.mjs通过createIntradayTrial工厂接管，旧控制器保留只读/补采/旧模式。intraday_probe.py增加lane=quote/minute，报价runtime=intraday-trial/quote-lane独立锁/缓存/健康/诊断/SQLite；分钟仍原root复用分钟缓存/核查/补采，避免共享JSON写入竞争。首个报价源立即发布，各自单进程与退避，45/180秒硬停对应进程树、120/300秒冷却；2轮完整推进且快于自身目标才恢复。提示接原toast，闲置不每秒重写历史。
- 采集监控新增报价/分钟两卡片，源时间/接收/页面时间分别显示，可只刷新一种；手动默认两类。当前组合展示不是同一个联合运行，策略准入及分钟闭合未改变；旧连续窗口因split profile变化失效标识保留，新统一验收按用户约定禁启动。股票管理库报价缓存优先读quote-lane；新任务无新报告时run_id/metrics留空，previous_run_id单列，避免旧新轮次混淆。
- 真实盘后首轮报价50/50 1.203秒、分钟50/50 32.281秒。并行观察q=20261125T171258-0d1c73b6（50/50 1.110秒），分钟未结束再q=20261125T171314-55c687cb（50/50 1.031秒）；同一个minute=20261125T171258-38edb008 36.265秒49/50，000786新浪ReadTimeout+东财ProxyError，保留17:11旧缓存且接收时间不改。此失败已保留，不要改报50/50；两种类型盘后fresh均0，不是盘中15秒验收。
- Python114/Node108通过，真实HTML/API/节点与图表联调通过；日线/旧报价/管理库/原验收212文件hash不变，52分钟系列version不变，最新49序列11662行数据库匹配，两个DB完整性ok，正式闭合0。qa/split-selfcheck-20261125.json、split-live-observation、split-storage-check、split-before留证。自动与补采true、v2与旧验收ID均保留。无浏览器视觉QA、无新连续验收，全部本地未提交。下一批小样本分钟标签/闭合准入，后续再统一策略取数/订阅实时；注意更高报价频率带来的请求/存储代价。

- 分钟使用规则第二批已部署（minute-use-rules-20261125.md）：minute-readiness.mjs按已有缓存对50只分类，质量页新增全池状态表+3核查样本最近30根详情，图表提示策略暂不可用。GET /intraday/minute-readiness（全池摘要或?code），GET /intraday/strategy-minutes?code当前返回409/available=false/bars=[]及阻断原因。来源标签/闭合规则均unverified，不能靠等待、重复未变或缓存closure_verified=true绕过。尚未重接所有研究策略，不要声称已提供可靠正式分钟。
- tools/intraday_minute_evidence.py接入原3只audit：独立运行且接收时间推进才累计逐根观测，修订重置连续未变，来源/口径隔离；最多300标签，摘要剔除bar_evidence。本次从3份已保存响应各初始化238根，每根仅1次，旧总体次数不倒填；没有新增行情请求。现50只11900标签；每股14:57—15:00间2标签共100个单列boundary_gap_unverified，普通内部疑似0但不代表无缺。闭合及策略可用均0。
- Python123/Node124通过，真实API/HTML/节点/图表检查通过；313原数据/状态/固定验收文件hash未变，v2、旧验收ID均保留。qa/minute-rules-selfcheck-20261125.json/initialization/before留证。当前分钟仍49/50，000786旧缓存保留；没重采掩盖失败。无浏览器视觉QA、无新连续验收，全部本地未提交。
- 重要当前状态纠正：本批20:45开始前config.intraday-trial.json的automatic_enabled已是false（文件最后修改17:32:26），本批保持暂停，未擅自恢复；backfill.enabled仍true，日线已由其独立计划更新为ready。不要沿用上一批enabled=true假设。平台已运行。下一步核实某一来源真实分钟标签/边界和盘中形成过程，再决定闭合规则；不可只改阈值或声明所有策略已经改用新输入口。

- 第三批分钟来源与边界证据已部署（minute-source-study-20261125.md）：查阅沪深2026交易规则，14:57—15:00为收盘集合竞价，minute-use.v2将14:57加入边界（现每股3根边界/235待验证）。AKShare维护者适配代码同用getKLineData，但不证明来源标签起止/最终闭合，新浪/东财仍unverified，策略仍409/空bars。质量页新增3依据链接、导入/盘中记录及待核实项目，GET /intraday/minute-source-verification（可?code当前3样本）。
- tools/intraday_boundary_observations.py被动接入原audit路径，不新增请求；独立minute-boundary-observations.sqlite，每份最多32重点标签（最近8+边界+修订），每股每来源每天600份，等价接收时刻去重。交易日历/同日/时段/≤180秒源标签差/接收后≤30秒归档且origin=live才计盘中，仍不证明闭合。失败保留行情，导入不计盘中，日摘要仅保留每股最近12份，完整有界档案在SQLite。
- 本批导入600519/000001/000063原17:12—17:13保存响应各一份，9重点标签/份，3份导入、有效盘中0；自动仍false，未恢复、未启动新验收或外部行情请求。原分钟49/50、000786缓存、v2及旧验收均保持。135 Python/129 Node通过，实际HTML/API/节点/图表检查通过；314原数据与采集配置hash不变，三库完整性ok、正式闭合0。qa/source-study-selfcheck/import/before-20261125.json留证。无浏览器视觉QA；全部本地未提交。下一步需真实盘中形成过程和可靠来源规则，不能将本批记录能力当作已验证来源闭合。

- 用户开启自动采集后，按要求完成2026-11-26北京时间13:27:22.638—13:37:22.638固定10分钟观察，详见intraday-observation-10min-20261126.md。122份只读状态、0观察/API错误；报价39轮、分钟10轮，完成轮均50/50、满足当前新鲜度及源时间推进；P95全流程分别1.998/33.802秒。实际启动间隔P50为15.164/60.507秒，报价相对名义40轮少1轮，不宣称严格15秒。分钟运行期间报价完成20轮。
- 本窗口78报价请求、502分钟请求、0来源请求失败/冷却跳过。002049/002129初次分钟标签停滞，运行20261126T133042-f528762c各追加1次同源复查后推进到13:31，是真实定向恢复。窗口前13:19:52双报价源ReadTimeout已退避恢复，单独保留，不混入窗口指标或称长期稳定。3审计股各10份真实盘中证据，标签13:27→13:36；216次重叠重点标签比较未见修订，不能当作闭合证明。
- 三库只读quick_check均ok；10轮500序列/75967行次入库核对一致（非新增唯一条数），闭合及策略准入仍0。自动配置与管理库、原验收会话哈希未变；automatic_enabled=true，采集继续，观察进程已结束。qa/ten-minute-20261126T132722/result.json及storage-selfcheck.json留证。未改生产代码、无新统一验收、无浏览器视觉QA，全部本地未提交。分析按完成控制器历史去重，不能把运行中/完成后两种started_at重复计轮。

- 下一阶段第一批已部署分钟形成对照（minute-formation-comparison-20261126.md）：tools/intraday_formation.py按来源/口径/运行对既有有界归档分析，排除导入及无效盘中证据，同运行重试取最终接收、等价时区/相同接收时刻去重；统计标签推进/停滞/倒退、逐标签OHLC/成交量/额修订及后续标签出现后的修订。原export_observations复用，页面assets/intraday-formation.js在质量与记录的来源核实区展示3样本、每来源8标签/3修订，自动刷新保留展开。无新增行情请求/前端轮询，来源规则与策略门槛未放宽。
- 真实既有档案为11-26的13:17—14:00，各样本44份、合计132份，标签均13:17→14:00、每样本43次推进/344次重叠比较，修订及倒退0；不是本批新观测窗口或全池持续验收。响应含11:30标签各44次，但边界附近接收0，已分列留存/附近两类，不能冒充午间形成证据。60秒采样与有限尾部不能证明闭合。最终证据qa/formation-20261126/published-selfcheck.json、api-selfcheck.json、panel-selfcheck.json。
- Python143/Node132全量通过；真实HTML/API/资源及页面节点联调通过，无浏览器整页视觉QA。导出0.0687秒，前后206行情缓存/状态hash不变；三库quick_check均ok，边界档案仍135条，正式闭合及策略准入0，策略接口仍409空bars。配置、v2及旧验收会话hash不变。联调时5555服务已停止，已恢复本地服务（现休市等待），自动开关保持true，不声称14:00后持续采集。未开启新统一验收，未提交或推送。下一批仍需可靠来源标签/闭合依据与关键边界形成记录。

- 图表表达与布局已优化（intraday-chart-balance-20261126.md）：行情页新增同源同日全池概览、七档涨跌分布、成交额Top6、所选股开高低/振幅/累计量额/价差、样本量额均价及昨收参考线、分钟量/额切换；名称代码筛选不缩小概览口径。50只排行限高434px/窄屏300px、逐股状态默认折叠限高330px，刷新保留滚动。来源时间到秒，缓存/其他日期明确显示；样本均价不是全日均价或闭合保证。
- 报价/分钟最近20轮分图展示P50/P95和各自目标；发现分钟历史有run_id=null、“上次独立任务中断”且27482.057秒，作为中断叉号保留、不压扁采集耗时分布。原记录未改，真实超时/失败仍计耗时。没有更改采集/股票池/分钟准入或新增轮询。时间格式器复用后本机节点构造两种量额模式每组15—30ms，非浏览器FPS保证。
- Node142全量通过；真实50股、三只分钟样本×两报价源六组、每组180根量额柱检查通过；HTML/资源200，旧验收与配置hash不变，自动true、v2、策略409空bars/准入0，当前休市。qa/chart-balance-20261126/selfcheck.json留证。浏览器目视尝试被URL允许访问校验中止，无后续浏览器操作，未完成整页视觉QA。未改Python采集、未新统一验收、未提交推送。建议后续常驻/中断告警→分钟闭合依据→按页轻量接口（现摘要约400KB）及时间缩放联动。

- 后台守护第一批已部署（platform-supervisor-20261126.md）：tools/platform_supervisor.py仅标准库，独立service目录/字节互斥，10秒本机轻量HTTP检查、2秒请求超时、30秒启动宽限；只重启自身Popen句柄，已明确退出则有界退避，无响应须连续3次；15分钟最多3次启动尝试（含手动/首次），状态跨守护重启保留。来源停滞/缺轮仅告警，休市、暂停和有计划退避排除；不结束未接管或身份不明服务。Stop持久关闭守护，不改行情开关，Start恢复；事件120条、页面8条，服务两路日志各约1MB×4滚动。
- server/service-health.mjs新增906字节左右轻量health入口，split/legacy controller增加无全池行情读取的health方法。summary附加service_health，采集监控新增常驻/中断卡片，断连弹提示、8秒页面请求上限，复用原5秒前端轮询。Windows普通用户任务M-quant Platform Supervisor已注册，Interactive/Limited、LogonTrigger、IgnoreNew、PT0S、守护失败3次/1分钟重试；未改日线任务。E盘Start/Stop已升级，旧脚本和任务XML已备份E:/M-quant/logs。当前任务Running，守护owned/healthy、自动true、v2，休市等待。
- Python157/Node147全量通过；隔离真实子进程验证异常退出恢复及日志滚动。生产E盘Stop→等待11秒无自启→Start新实例→重复Start同实例，均通过，结束已恢复开启。三库quick_check ok、闭合0、策略409空bars、旧验收/管理库/采集配置hash不变。qa/service-supervisor-20261126/{selfcheck,launcher-selfcheck,task-selfcheck,storage-selfcheck}.json留证；未浏览器视觉QA、未注销重登或新盘中验收，未提交推送。守护自行重启后若旧平台仍活着会观察而非强制接管，手动无响应服务需人工处理。下一批仍回分钟标签/闭合依据与关键边界，再做接口减重。

- 11-27日内K线与精简周月已部署（candlestick-charts-20261127.md）：默认K线/可切原分时线，复用原价格/量额区域；日内1分钟原始OHLC支持当天全部/最近60/30根，午休和缺口保留、不按报价造K线，详情默认追最新、手动点选后保留位置。周/月各至多12根，由同源同复权日线聚合，成交量手×100转股；不混入未完成当天日线，标明qfq与日线截止/覆盖，整期缺失保留横轴空档。新增candle-history.mjs只读接口、candle-data/charts/loader模块。仅当前股周月缓存读取，60秒复用/请求合并/失败退避，不新增行情请求。
- Node165全量通过；50股×周月100组真实读取均可用，最大6552字节/71ms；600519/000001/002129当天各211根09:31—14:31逐根显示。002129缺2个整周已留空；3股72个周月聚合用Decimal从原CSV独立核对通过。实际控制器日内→周→月→分时→30根切换通过、周月不多取分钟。159配置/缓存/原验收文件hash不变，v2与策略409空bars保持。qa/candles-20261127/{selfcheck,controller-selfcheck,aggregation-selfcheck}.json及日/周/月SVG/PNG留证，三份独立预览已目视检查，无浏览器整页视觉QA。
- 当前状态纠正：用户11-27已将automatic_enabled改为false，最后来源14:31，本批保持暂停，平台/守护在线；未因绘图恢复自动更新、未新收盘全天记录、无新统一验收。无活跃采集时已用既有Stop/Start加载新接口。分钟仍是未验证闭合的来源样本，图表“精确”仅表示保留既有来源数值，不宣称逐笔完整或正式策略可用。未提交推送。用户上轮问秒级距离时已建议下一批改为权限核查+3只订阅试采，闭合验证并行；本批K线请求没有取消该主线。

- 浏览器三处批注已处理（browser-comments-20261127.md）：周五15:06到周一11/30 09:30约66小时23分是当前常规窗口/本地日历正常等待，页面改主要显示下个交易日周一09:30，休市原因和长倒计时次级，午休单列13:00。优先next_session_at，不把旧next_start_at或中断/手动/休市记录当最近盘中自动成功，未改采集时段/频率。
- 新增candle-viewport.js与K线放大/缩小/前移/后移/最新/重置、Ctrl滚轮；价格和量额同窗，日内最小10根、周月3根，历史端点刷新保留，切股/换日/周期隔离，缩放不加请求不改OHLC。实际招商银行238→119根、历史平移/刷新/滚轮/重置通过，独立预览目视检查通过，无浏览器整页视觉QA（本地浏览器控制不可用）。
- 补采当前6边界待核实=3股×11/25、11/27两日14:58—14:59，另1移出股暂停；最新请求未见来源失败、额度0/20。来源尾部14:57→15:00且规则属于收盘集合竞价，但不能据此确认标签应缺失/已闭合。页面解释非已确认采集失败，列名改未覆盖/目标，默认近期当前池3行，全记录7行可切换，旧可执行/异常项不隐藏，错误优先，未改任务。Node176通过，159配置/缓存/原验收hash不变；qa/browser-comments-20261127/{diagnosis,selfcheck}.json及PNG留证。用户15:03已重新启用自动采集，当前保持true、v2、常规休市等待；不是本批恢复开关，无新统一验收/真实行情请求，未提交推送。

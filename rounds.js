// 每场面试一条记录。id 固定且唯一，round 和 date（YYYY-MM-DD）可省略。
// keywords 只显示在场次标题旁。example 直接显示在答案里，note 用于可展开的项目补充。
const speculativeSampling = { label: 'Speculative Decoding 论文', url: 'https://arxiv.org/abs/2211.17192' };
const dspark = { label: 'DSpark 论文', url: 'https://arxiv.org/html/2607.05147v1' };
const dflash = { label: 'DFlash 论文', url: 'https://arxiv.org/html/2602.06036' };
const eagle3 = { label: 'EAGLE-3 论文', url: 'https://arxiv.org/html/2503.01840' };
const awq = { label: 'AWQ 论文', url: 'https://arxiv.org/abs/2306.00978' };
const fp8 = { label: 'vLLM FP8 W8A8 文档', url: 'https://docs.vllm.ai/en/latest/features/quantization/fp8/' };

const interviewRounds = [
  {
    id: 'xiaohongshu-inference-infra',
    company: '小红书',
    title: '推理 Infra 面试',
    keywords: ['投机解码', 'KV Cache', 'FP8 量化'],
    questions: [
      {
        question: '投机解码是怎么加速推理的？',
        answer: '普通 decode 每生成 1 个 token，就要走一遍大模型。投机解码先用便宜的 Draft Model 提出多个候选，再让 Target Model 把这段候选当作已知输入，用一次因果前向并行算出各位置的预测，最后按顺序接收有效前缀。这样一次大模型前向就可能产出多个 token，减少串行步数和反复读取大模型权重的开销。',
        sources: [speculativeSampling],
      },
      {
        question: '投机解码采样中怎么保证最终输出分布与 Target Model 一致？',
        answer: '把草稿多报的概率裁掉，再把空出来的概率补给少报的 token。给定同一前缀，设 p、q 分别是目标和草稿实际用于采样的分布。对草稿候选 x，以 min(1, p(x)/q(x)) 接受，直接留下的概率质量是 min(p(x), q(x))。拒绝时按缺口 [p−q]₊ 归一化后补采样。两部分相加刚好是 p，逐位置成立就保证了整段序列分布一致。',
        example: {
          table: {
            caption: '同一前缀下的三个候选 token',
            columns: ['概率', 'A', 'B', 'C'],
            rows: [
              ['Target p', '50%', '30%', '20%'],
              ['Draft q', '70%', '20%', '10%'],
              ['直接留下', '50%', '20%', '10%'],
              ['各自缺口', '0%', '10%', '10%'],
            ],
          },
          text: '把同一个前缀独立采样 100 次，期望 Draft 提议 A 70 次。A 以 50/70 的概率通过，期望留下 50 次、拒绝 20 次。B、C 一旦被提议就直接接受，期望留下 20 次和 10 次。\n\n拒绝分支占 20%。B、C 各缺 10 个百分点，所以一旦拒绝，就在 B、C 之间各以 50% 的概率补采。期望各补 10 次，最后得到 A 50、B 30、C 20，恰好匹配 Target。',
        },
        sources: [speculativeSampling],
      },
      {
        question: 'DSpark 相比 DFlash 做了哪些改进？',
        answer: 'DFlash 先把 Target 的多层特征投影成各 Draft 层的上下文 KV，再用一次 block diffusion 前向并行算出所有候选位置的 logits。DSpark 保留这条并行骨干，增加两个轻量 head。\n\nMarkov head 根据上一个实际采到的 token，给下一位置的 logits 加一个低秩转移偏置。例如先采到 New，就可以给下一位的 York 加分。骨干仍然只跑一次。\n\nConfidence head 用当前位置的 hidden state 和上一个 token 的 embedding，估计前面都通过时这一位的接受率。若前两位的条件接受率分别是 90% 和 60%，两位都通过的概率约为 54%。调度器结合这个估计和负载决定验多长，最终仍按 Target 的精确规则验收。',
        sources: [dspark, dflash],
      },
      {
        question: '投机解码在工程实现中如何管理 Draft Model 和 Target Model 的 KV Cache？',
        answer: 'Draft 和 Target 对齐同一条已提交的 token 前缀，各自保存本模型的 KV。候选 KV 先写临时 slot，验证后提交接受前缀，回收或复用拒绝后缀的 slot。树验证只提交命中路径上的 KV。补采的 token 或 bonus token 要等自己走过前向后才有对应 KV。',
        sources: [{ label: 'TensorRT-LLM 投机解码实现说明', url: 'https://github.com/NVIDIA/TensorRT-LLM/blob/main/docs/source/features/speculative-decoding.md' }],
      },
      {
        question: 'EAGLE3、DSpark、DFlash 三种方法的最终结果是什么？',
        answer: 'DSpark 论文表 1 用 Qwen3-4B、temperature=1、链式起草，关闭置信度调度。按 EAGLE-3 / DFlash / DSpark 顺序，每轮平均产出（含目标补出的 1 token）在 GSM8K 是 5.14 / 5.40 / 6.11，在 MT-Bench 是 2.39 / 3.07 / 3.64。\n\n速度有各自的基线。DFlash 论文用 Qwen3-4B、temperature=1，DFlash 块大小和 EAGLE-3 树大小均为 16，两者相对逐 token 解码的平均 decode 加速分别是 4.24× 和 1.72×。DSpark 线上对比 MTP-1，DeepSeek-V4-Flash 在同等总吞吐下单用户生成速度提升 60%–85%。',
        note: {
          text: '个人实测待补。报三种方法在同一套模型、硬件和流量下的接受长度、TPOT、输出吞吐，以及相对同一基线的端到端加速比。',
        },
        sources: [dspark, dflash],
      },
      {
        question: '为什么你实测 DFlash 的端到端加速比反而高于 DSpark？',
        answer: '先拆成每轮成本和每轮产出。DFlash 以一次并行前向出草稿，DSpark 的顺序修正和置信度计算可能增加起草关键路径。如果 DSpark 多接受的 token 不足以覆盖这部分开销，或两者的 kernel、CUDA Graph、验证批形状不同，DFlash 的实际每 token 成本就可能更低。',
        note: {
          text: '实测归因待补。固定 Target、精度、输入输出长度、采样配置与并发，拆 draft、verify、调度和采样耗时。对 DSpark 消融调度，再扫 batch 和草稿长度。用 trace 和每轮实际产出的 token 数确认差异来源。',
        },
        sources: [dflash, dspark],
      },
      {
        question: '投机解码的 Benchmark 最应该关注哪些性能指标？',
        answer: '先看用户侧 TTFT、TPOT 或流式 ITL、端到端延迟（至少报 P50/P95），再看服务侧输出 tokens/s、请求吞吐和满足延迟 SLO 的 goodput。诊断用每轮产出、分位置接受率、已起草/已验证/已接受 token 数，以及 draft、verify 各自的耗时。接受率要标明分母口径，每轮产出要标明是否含目标补出的 token。',
        sources: [{ label: 'vLLM 投机解码指标', url: 'https://docs.vllm.ai/en/latest/features/speculative_decoding/acceptance_metrics/' }],
      },
      {
        question: 'EAGLE3 的 Tree Construction 和 Tree Attention 是怎么实现的？',
        answer: '构树沿用 EAGLE-2 的动态树。Draft 从同一个前缀提出多条候选路径，用路径累计概率选择扩展的分支，最后按节点预算裁剪。验证时把整棵树摊平，一次送给 Target。Tree Attention 保证每个节点只能看已确认前缀、自己的祖先和自己，位置编号按树深度计算。这样可以一次算出多条路径各自的 next-token logits。',
        example: {
          tree: '已确认前缀 → r\n             ├─ A\n             │  ├─ A1\n             │  └─ A2\n             └─ B\n                └─ B1',
          text: '构树时，r 是 Target 已选出的起始 token。Draft 融合 Target 低、中、高层特征，每个活跃节点提 top-k 子节点。若 A → A1 的累计概率是 0.6 × 0.5 = 0.30，而 B → B1 是 0.4 × 0.9 = 0.36，就优先保留 B1。实现中用累计 log-prob 排序并记录父节点。\n\n摊平为 [r, A, B, A1, A2, B1] 后，普通因果 mask 会让 A1 看到 B。树 mask 让 A1 只看已确认前缀和 [r, A, A1]。前缀长度为 L 时，r 的 position ID 是 L，A/B 是 L+1，三个叶子都是 L+2。\n\n参考实现用 retrieve_indices 找回候选路径。贪心验证时，如果 r 的 logits 选 A，A 的 logits 选 A2，就提交 r → A → A2 上的 KV。',
        },
        sources: [eagle3, { label: 'EAGLE-3 构树代码', url: 'https://github.com/SafeAILab/EAGLE/blob/main/eagle/model/cnets.py#L670-L807' }, { label: '树验证与 KV 提交代码', url: 'https://github.com/SafeAILab/EAGLE/blob/main/eagle/model/utils.py#L306-L449' }],
      },
      {
        question: 'RTN、SmoothQuant、AWQ 三种量化方法的核心区别是什么？',
        answer: 'RTN 在给定 scale 和量化范围后，把值映射到最近的格点。权重量化时可以只用权重统计。SmoothQuant 面向 INT8 W8A8，用等价变换 XW = (XD⁻¹)(DW)，把 activation outlier 的量化难度转移到更容易量化的权重。原始 AWQ 主要做低比特 weight-only（常见 W4A16），用激活统计识别重要输入通道，通过逐通道缩放和权重量化降低输出误差，运行时激活保持高精度。',
        sources: [{ label: 'SmoothQuant 论文', url: 'https://proceedings.mlr.press/v202/xiao23c.html' }, awq],
      },
      {
        question: '你的 AWQ-FP8 相比原始 AWQ 做了哪些改进？',
        answer: '可以从校准目标和执行路径答。原始 AWQ 主要优化低比特权重误差。如果你的方案是 FP8 W8A8，就解释如何用激活感知缩放降低权重与激活共同量化后的误差。对比实际采用的 FP8 格式、权重与激活 scale 粒度、静态或动态缩放，再说明缩放如何融合、线性层如何接入原生 FP8 GEMM，以及敏感层如何处理。',
        sources: [awq, fp8],
      },
      {
        question: '为什么 FP8 W8A8 量化之后，端到端加速比只有 1.2～1.3×？',
        answer: '端到端收益取决于加速覆盖率。如果基线 40% 的时间在可提速的 GEMM 上，即使这些 GEMM 快 2×，整体也只有 1 ÷ (0.6 + 0.4/2) = 1.25×。FP8 W8A8 主要加速走 FP8 kernel 的线性层，运行时还要看 attention/KV 访存、通信、调度、激活量化和小 shape 下的利用率。',
        sources: [fp8],
      },
    ],
  },
];

const vllmSpeculative = { label: 'vLLM 投机解码配置', url: 'https://docs.vllm.ai/en/latest/features/speculative_decoding/' };
const vllmDFlash = { label: 'vLLM DFlash 实现', url: 'https://docs.vllm.ai/en/latest/api/vllm/v1/worker/gpu/spec_decode/dflash/speculator/' };
const vllmDSpark = { label: 'vLLM DSpark 实现', url: 'https://docs.vllm.ai/en/latest/api/vllm/v1/worker/gpu/spec_decode/dspark/speculator/' };
const sglangDFlash = { label: 'SGLang DFlash worker', url: 'https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/speculative/dflash_worker_v2.py' };
const sglangDSpark = { label: 'SGLang DSpark 部署示例', url: 'https://github.com/sgl-project/sglang/blob/main/docs/cookbook/autoregressive/DeepSeek/DeepSeek-V4.mdx' };
const eagleTree = { label: 'EAGLE-3 构树代码', url: 'https://github.com/SafeAILab/EAGLE/blob/main/eagle/model/cnets.py#L670-L807' };
const eagleVerify = { label: 'EAGLE-3 验证和 KV 提交代码', url: 'https://github.com/SafeAILab/EAGLE/blob/main/eagle/model/utils.py#L306-L449' };
const moeSpeculation = { label: 'Utility-Driven Speculative Decoding for MoE', url: 'https://arxiv.org/html/2506.20675' };
const magicDec = { label: 'MagicDec 项目页', url: 'https://infini-ai-lab.github.io/MagicDec-part1/' };
const gptq = { label: 'GPTQ 论文', url: 'https://arxiv.org/abs/2210.17323' };
const smoothQuant = { label: 'SmoothQuant 论文', url: 'https://proceedings.mlr.press/v202/xiao23c.html' };
const fp8Schemes = { label: 'LLM Compressor 的 FP8 方案', url: 'https://docs.vllm.ai/projects/llm-compressor/en/latest/guides/compression_schemes/' };

interviewRounds.push({
  id: 'microsoft-inference-infra',
  company: '微软',
  title: '推理 Infra 面试',
  keywords: ['投机解码', 'MoE', '模型量化'],
  sections: [
    {
      title: '投机解码',
      questions: [
        {
          question: 'EAGLE3、DFlash、DSpark 三者的区别是什么？',
          answer: '主要区别是草稿如何生成，以及 Target 一次验证多少候选。三者都利用 Target 的特征起草，由 Target 负责最终验收。\n\nEAGLE-3 融合 Target 的低、中、高层特征，Draft 自回归出候选，再用动态树覆盖多条后续路径。DFlash 把 Target 特征注入各 Draft 层的上下文 KV，用一次 block diffusion 前向并行生成整块候选，缩短起草关键路径。\n\nDSpark 保留 DFlash 的并行骨干，再用轻量 Markov head 根据上一个实际采到的 token 修正当前 logits，改善块内一致性。它还可以预测每个位置的条件接受率，结合负载决定验证多长。实际收益取决于起草耗时、每轮接受长度和 Target 验证成本。',
          sources: [eagle3, dflash, dspark],
        },
        {
          question: 'DFlash / DSpark 在实际推理时需要哪些输入？接入 vLLM / SGLang 的整体流程是什么？',
          answer: '启动时需要匹配的 Target 和 Draft 权重或内置 draft head、要捕获的 Target 层、anchor / mask 配置和 block size。每轮运行时，Draft 接收已确认前缀的 Target 多层特征（可先投影成 Draft KV）、Target 已选出的 anchor token、用于构成 query block 的 mask token，以及 position IDs 和 KV slot 元数据。\n\n流程是「Target prefill 捕获特征 → 投影并缓存 Draft 上下文 KV → Draft 用块内双向注意力一次算出块 logits → Target 以因果注意力验证候选 → 提交有效前缀和相应 KV → 更新特征与下轮 anchor」。DSpark 在块 logits 上做轻量串行修正。启用自适应验证时，调度器在 Target 前向前选定候选长度。\n\nvLLM 的 speculative config 用 method=dflash 或 dspark，按 checkpoint 配置 model 和草稿长度。SGLang 对应 DFLASH / DSPARK，外置草稿用 speculative-draft-model-path，带内置 head 的 checkpoint 可从 Target checkpoint 加载。对照 checkpoint 是否在 anchor 位置也生成候选，再确定草稿数量和实际验证宽度。DSpark 也可走固定宽度验证，是否启用置信度调度取决于后端和配置。',
          sources: [vllmSpeculative, vllmDFlash, vllmDSpark, sglangDFlash, sglangDSpark],
        },
        {
          question: 'EAGLE3 需要维护 KV Cache，DFlash、DSpark 也需要吗？',
          answer: '需要。三者都要维护 Target 的主 KV Cache，以及 Draft 侧用于读历史前缀的缓存。差异是 Draft KV 怎么来的。EAGLE-3 的 Draft 自回归扩展，Draft 层前向会产生自己的 KV，树分支有临时状态。DFlash / DSpark 主要把已确认 token 的 Target hidden states 投影成 Draft 各层的上下文 K/V，再跨轮复用。\n\n本轮 mask block 用于生成候选。下一轮的持久上下文由已经验证并提交的位置推进。DSpark 的 Markov head 还读块内上一个采样结果，这个依赖由轻量 head 处理。工程上 Target 和 Draft 可以共享逻辑 token 索引或分配设施，各自仍按自己的层布局保存 KV。',
          sources: [eagleTree, dflash, vllmDFlash, vllmDSpark],
        },
        {
          question: 'Target 产生的 Hidden States 和 KV Cache，DFlash、DSpark 分别怎么用？',
          answer: 'Hidden states 用来给 Draft 提供上下文，Target KV 用来给 Target 自己验证。以 DFlash 为例，先捕获 Target 指定层的 hidden states，拼接并投影得到上下文特征，再经每个 Draft 层自己的 K/V 投影写入 Draft cache。验证后只用已提交位置对应的 Target 特征更新 Draft cache。\n\nTarget 验证时读自己的历史 KV，并为本轮候选计算因果 logits 和临时 KV。验收后提交命中前缀，释放或覆盖其余候选 slot。DSpark 沿用这条上下文 KV 路径，再用 Markov head 修正块 logits，并可用 confidence head 给调度器提供接受率估计。',
          sources: [dflash, dspark, vllmDFlash, sglangDFlash],
        },
        {
          question: '为什么 MoE 的投机解码收益通常不能随一次 Verify 的 token 数近似线性提升？',
          answer: '低 batch 的 Dense decode 常受权重带宽限制。同一层验证多个 token 时，它们能复用同一套权重，因此 Verify 增加的时间有时小于 token 数增加的比例。MoE 的每个 token 可能路由到不同专家，验证更多位置会扩大这一轮激活的专家并集，读更多专家权重。\n\n收益还取决于真正通过验证的前缀有多长。后面被拒掉的候选也已经做了 routing、专家计算和 attention。启用 Expert Parallelism 时，还可能增加 dispatch / combine 通信。工程上应扫草稿长度和并发，比较「每轮总耗时 ÷ 每轮产出 token 数」，同时看各层专家并集和接受长度。',
          sources: [moeSpeculation, speculativeSampling],
        },
        {
          question: 'EAGLE3 的 Proposal → Verify → Accept 三个阶段分别怎么做？',
          answer: 'Proposal。Target 先选出起始 token，Draft 利用 Target 多层特征和采样 token 的 embedding 起步，用轻量解码层自回归展开候选树。向更深的分支走时，Draft 接着使用自己生成的中间表示。\n\nVerify。把节点摊平，给每个节点按树深度设 position ID，用 Tree Attention 保留各路径自己的历史。Target 一次 forward 算出树上各节点的 next-token logits。\n\nAccept。Greedy 时逐层取父节点 logits 的 argmax，沿匹配的子节点走，直到缺少匹配或到叶子。提交已通过路径的 KV，再由 Target 提供下一个 token。随机模式使用相应的树采样验证规则。统计时要区分接受的草稿 token、已经选定的起始 token 和 Target 新采样的 token。',
          sources: [eagle3, eagleTree, eagleVerify],
        },
        {
          question: 'EAGLE3 的 Proposal 怎么生成 Tree？怎么防止树无限膨胀？',
          answer: '从 Target 已选出的 anchor 开始，Draft 对每个活跃节点取局部 top-k 子节点。用「父路径累计 log-prob + 子 token 的条件 log-prob」给完整路径打分。同一深度将候选合在一起，只选分数最高的一批继续扩展。\n\n参考实现同时限制每层继续扩展的宽度、最大深度和送给 Target 的总节点数。展开结束后按累计分数做全局裁剪，记录保留节点的父索引。比如 A 的单步概率是 0.6，B 是 0.4，但 A→A1 累计只有 0.6×0.4=0.24，B→B1 有 0.4×0.8=0.32，预算紧时更优先保留 B→B1。',
          sources: [eagle3, eagleTree],
        },
        {
          question: 'Tree Attention Mask 怎么构造？拿到 logits 后怎么判断接受几个 token？',
          answer: '先摊平树，再存一个 parent 数组，元素是父节点的整数下标。保证父节点在子节点前，就能逐行构造 mask。根在树内只看自己，每个子节点复制父节点的可见行，再把自己的列设为可见。所有节点都能读已确认前缀的 KV。\n\nTarget 的第 i 行 logits 预测节点 i 之后的 token。Greedy 验证从根开始，拿当前行的 argmax 去找匹配的子节点。每找到一个就接受一个草稿 token，再用这个子节点自己的 logits 验下一步。找不到子节点时，由该行 argmax 给出 Target 续写的 token。\n\n参考实现用 retrieve_indices 把扁平 logits 拿回每条路径，比较「父节点 argmax」和「子 token」，再用累积乘积求最长连续匹配前缀。下面的伪代码用逐节点走树来展示同样的 Greedy 判断。随机采样分支则依次尝试同一父节点下互异的子 token，每次拒绝后移除该 token 的概率质量并重新归一化。',
          example: {
            tree: '已确认前缀 → r\n             ├─ A\n             │  └─ C\n             └─ B',
            table: {
              caption: '摊平顺序为 r、A、B、C。1 表示可见',
              columns: ['Query / Key', 'r', 'A', 'B', 'C'],
              rows: [
                ['r', '1', '0', '0', '0'],
                ['A', '1', '1', '0', '0'],
                ['B', '1', '0', '1', '0'],
                ['C', '1', '1', '0', '1'],
              ],
            },
            text: '节点下标依次是 r=0、A=1、B=2、C=3，对应 parent=[-1, 0, 0, 1]。C 的父节点是 A，所以第 3 行复制第 1 行，再打开 C 自己的列，得到 [1, 1, 0, 1]。若前缀长度是 L，四个节点的 position ID 分别是 [L, L+1, L+1, L+2]。\n\nlogits[0] 是读完 r 后的预测，用来验证 A 或 B。logits[1] 是读完 r→A 后的预测，用来验证 C。logits[2] 对应 r→B，logits[3] 对应 r→A→C，这两行给各自路径末尾的下一 token 打分。\n\n例如 logits[0] 的 argmax 是 A，logits[1] 的 argmax 是 C，logits[3] 的 argmax 是 X。走到 C 后找不到下一子节点，所以 accept_length=2，数的是 A、C。r 是本轮开始前已选的 anchor，X 是本轮 Target 续写的 token。此时保留 r、A、C 已计算的 KV。',
            code: {
              caption: '从父索引到接受长度的 Greedy 伪代码',
              text: `tokens = [r, A, B, C]
parent = [-1, 0, 0, 1]
n = len(tokens)
mask = [[False] * n for _ in range(n)]
positions = [prefix_len] * n
children = [[] for _ in range(n)]

# 父节点先处理，子节点继承父行再打开自己
for i, p in enumerate(parent):
    if p >= 0:
        mask[i] = mask[p].copy()
        positions[i] = positions[p] + 1
        children[p].append(i)
    mask[i][i] = True

# logits[i] 给节点 i 之后的候选 token 打分
logits = target_forward(
    tokens, prefix_kv, mask, positions
)

node = 0
accepted_rows = []
while True:
    next_token = argmax(logits[node])
    child = None
    for candidate in children[node]:
        if tokens[candidate] == next_token:
            child = candidate
            break
    if child is None:
        break
    accepted_rows.append(child)
    node = child

accept_length = len(accepted_rows)
keep_kv_rows = [0] + accepted_rows
# 示例结果是 2、[0, 1, 3]、next_token = X`,
            },
          },
          sources: [eagleTree, eagleVerify],
        },
        {
          question: '非 Greedy 的采样模式下，Rejection Sampling 怎么保证最终分布不变？',
          answer: '在同一个已接受前缀上，令 p 为 Target 实际采样分布，q 为 Draft 实际提议分布。候选 x 从 q 抽取，以 min(1, p(x)/q(x)) 接受。直接留下 x 的概率质量是 min(p(x),q(x))。若拒绝，按 [p−q]₊ 归一化后的分布补采，拒绝的总概率恰好等于这些缺口的总和。所以两条路径合起来正好得到 p。\n\n按位置顺序验证。第一次拒绝后，剩余草稿基于旧前缀，直接丢弃。全接受时，可从 Target 下一位置分布采一个 bonus token。temperature、top-p 等处理后的实际 p 和 q 才能代入。树形候选需要使用与其提议方式匹配的树验证算法。',
          sources: [speculativeSampling, eagleVerify],
        },
        {
          question: 'Speculative Decoding 为什么能加速 Decode？',
          answer: '把多次串行 Target 解码合成一轮 Draft + Verify。Draft 先便宜地生成 K 个候选，Target 把候选当已知输入做一次并行因果前向，顺序筛出能提交的前缀。一轮能产出多个 token，就减少了重复跑 Target 和读大权重的次数。\n\n粗略加速比是「每轮产出的 token 数 × 普通 decode 每 token 时间 ÷（起草 + 验证 + 采样调度时间）」。K 太大时，验证会变贵，额外候选也更容易落在第一个拒绝之后。最终选的是单位输出成本最低的 K。',
          sources: [speculativeSampling, moeSpeculation],
        },
        {
          question: '为什么 Decode 通常是 Memory Bound？一次 Verify 多个 token 为什么能提高 GPU 利用率？',
          answer: '低并发 Decode 每条请求每步只处理一个新 token。大量线性层近似小 M 的 GEMM 或 GEMV，权重要从 HBM 读进来，却只服务少量向量，FLOPs / Byte 很低。长上下文下，还要读很长的历史 KV，attention 也会吃带宽。\n\n一次 Verify 多个位置会增大 GEMM 的 M 维，多行复用同一块权重，提高算术强度和 Tensor Core 利用率。仍处在带宽瓶颈时，验证多个位置的时间可能只比单步稍长。大 batch、长上下文或 K 过大时，计算、KV 读取和临时状态的成本会上升，需要实测。',
          sources: [speculativeSampling, magicDec, moeSpeculation],
        },
        {
          question: '只考虑单 GPU，为什么 MoE 投机解码效率仍可能不如 Dense？',
          answer: '即使专家全在一张卡上，路由分散也会使每个专家收到的 token 数很小。验证批在全局上变大，却被拆成许多小而不均匀的 GEMM，专家内的权重复用有限。HBM 还得读更多被激活的专家权重，token 排序、gather / scatter 和 combine 也消耗本卡带宽。\n\n举个简化例子。8 个专家、独立均匀 top-1 路由时，验证 1 个位置只用 1 个专家，验证 4 个位置期望用到 8×(1−(7/8)⁴)≈3.31 个专家。Dense 的 4 个位置能反复用同一套权重。实际路由越集中，专家复用越好，因此应看各层专家并集和每个专家的 token 分布。',
          sources: [moeSpeculation],
        },
        {
          question: '还有哪些投机解码新工作？超长 Context 下有什么不同？',
          answer: '近期可以看 DPara。它在 Target 验证当前块时，为可能的接受边界预计算下一轮 Draft 表示，等真实验收边界和 bonus token 出来，再用轻量 head 接上，把大部分起草计算和验证重叠。\n\n长上下文主要多了历史 KV 的读取成本。TriForce 做层级投机，先用小模型起草，再用 Target 权重加检索出的稀疏 KV 做中间验证，最后由完整 Target 验收。MagicDec 则给 Draft 使用有界大小的稀疏 KV，缓解大 batch、长上下文下的起草带宽压力。最终 Target 按自身的完整验证语义验收，Draft 或中间阶段的近似主要改变接受率和速度。',
          sources: [
            { label: 'DPara 论文', url: 'https://arxiv.org/abs/2609.27396' },
            { label: 'TriForce 论文', url: 'https://arxiv.org/abs/2404.11912' },
            magicDec,
          ],
        },
        {
          question: 'Draft Model 怎么训练？训练数据从哪里来、规模多大？',
          answer: '通常冻结 Target，用有代表性的对话、代码和数学 prompts 让它生成续写，再采集续写 token、指定层的 hidden states，以及方法需要的 Target logits。用这些样本训练轻量 Draft，使它在真实前缀上尽可能贴近 Target。\n\nEAGLE-3 做 Training-Time Test，在训练中多步展开 Draft，让它习惯读自己产生的表示。DFlash 在 Target 续写中随机选 anchor，遮住后面的 block，用偏重前部位置的交叉熵并行预测。DSpark 还加了分布匹配和置信度损失，直接学习接受概率。\n\n公开数据口径各异。EAGLE-3 论文列出约 6.8 万条 ShareGPT 和 46.4 万条 UltraChat 数据。DFlash 论文混用约 80 万条 NVIDIA Nemotron Post-Training Dataset V2 和 CodeAlpaca 样本。DSpark 的对比实验用约 130 万条 Open-PerfectBlend prompts，请各 Target 重新生成答案。比较规模时要同时报训练 token 数、序列长度和训练轮数。',
          sources: [eagle3, dflash, dspark, { label: 'DeepSpec 训练代码', url: 'https://github.com/deepseek-ai/DeepSpec' }],
        },
        {
          question: 'Draft Model 的 Loss 曲线怎么看？怎么判断训练完成？',
          answer: '先看训练和验证 Loss 是否稳定，再按草稿位置拆开看。第一个位置错会截断整条接受前缀，前几位的错误对线上效率更敏感。DSpark 还要分别看 token 预测、分布匹配和置信度损失。置信度需要对照实际接受率做校准。\n\n选 checkpoint 要跑真实 Draft → Verify rollout。固定 Target、采样方式、草稿预算与并发，在未见过的任务上看分位置接受率、每轮产出、draft 耗时和 TPOT。验证收益连续几个 checkpoint 进入平台期，就可停止训练，从满足时延目标的 checkpoint 中选效果最好的。',
          sources: [eagle3, dspark],
        },
      ],
    },
    {
      title: '量化',
      questions: [
        {
          question: 'AWQ 和 GPTQ 的核心区别是什么？两者怎么做？',
          answer: '两者都可做权重的离线低比特量化，差别在于怎么减少输出误差。AWQ 根据校准激活识别重要输入通道，量化前用等价的通道缩放放大显著权重，并把逆缩放折入上游算子。典型实现用校准样本的层输出误差选择缩放与裁剪，再按组量化权重。\n\nGPTQ 根据校准输入估计层重构误差的 Hessian。若 W 是 [out, in]，X 是输入列向量组成的矩阵，目标是减小 ‖WX−ŴX‖²。它依序量化 W 的列，并用逆 Hessian 信息调整之后还没量化的列，补偿已经引入的误差。AWQ 的重点是选通道缩放，GPTQ 的重点是逐列误差补偿。',
          sources: [awq, gptq],
        },
        {
          question: 'FP8 W8A8 怎么选 Scale？Calibration Data 有什么用？',
          answer: '先选 kernel 支持的 FP8 格式和 scale 粒度，例如权重 per-channel / per-block、激活静态 per-tensor 或动态 per-token。用 q=cast_fp8(clip(x/s)) 的约定，最简单的 scale 是该组 amax 除以格式的最大有限值，比如 E4M3 的 448。更激进的 clipping 可以减弱极少数离群值对大多数值分辨率的影响。\n\n静态激活 scale 用有代表性的校准样本统计激活范围，可比较不同 clipping 阈值下的层输出误差。动态 scale 在推理时按当前 token 或块算 amax，并把归约、cast 的成本计入性能。若叠加 AWQ 式通道等价缩放，还要校准这组通道缩放，并验证 W 与 A 一起量化后的误差。',
          sources: [awq, fp8Schemes, { label: 'FP8 格式论文', url: 'https://arxiv.org/abs/2209.05433' }],
        },
        {
          question: '量化时应该比较 Weight Error 还是 Output Reconstruction Error？',
          answer: '选 scale 或 clipping 时，通常优先看层输出重构误差。Weight Error 把所有权重差值同等看待，层输出误差 ‖(W−Ŵ)X‖² 会考虑校准输入的尺度和相关性。例如某个输入通道很活跃，那一列相同大小的权重量化误差，可能给层输出带来更大的扰动。\n\n对 W8A8，应把量化后的激活也纳入计算，即比较原始 WX 和实际量化路径得到的 ŴX̂。Weight Error 仍适合快速定位饱和或异常层。最终要在独立数据上验证端到端精度。',
          sources: [awq, gptq, smoothQuant],
        },
        {
          question: 'SmoothQuant 和 AWQ 的区别是什么？为什么可以放在一起比较？',
          answer: '它们都用校准激活决定输入通道的等价缩放。例如用对角矩阵 D 把 XW 改写成 (XD⁻¹)(DW)，浮点计算结果相同，量化后的误差分布会改变。\n\nSmoothQuant 主要为 INT8 W8A8 服务，压低激活离群值，把部分难度转移到权重。AWQ 原始设定主要是 W4A16 之类的 weight-only，利用激活显著性保护对输出更敏感的权重通道。对比它们能看清缩放目标的区别。做速度和精度对照时，应注明 W/A 位宽、scale 粒度、kernel 及 workload。',
          sources: [smoothQuant, awq],
        },
        {
          question: 'MoE 量化的难点是什么？为什么 Router 往往保留 BF16？',
          answer: '一个难点是专家输入不均衡。不同专家可能收到完全不同规模和分布的校准 token，少被路由到的专家更容易校准不足。应按实际路由统计每个专家的样本覆盖和误差，检查长尾任务与专家负载。\n\n另一个难点是 Router。它的 top-k 是离散选择，边界两侧的分数接近时，一点量化误差就可能换掉整个专家，影响输出和负载分布。Router 在总开销里通常很小，保留 BF16 权重和输入、必要时用 FP32 计算路由分数或 softmax，成本通常可控。相比逐层误差，还要检查路由 top-k 一致率和端到端质量。',
          sources: [
            { label: 'Switch Transformer 选择性精度', url: 'https://www.jmlr.org/papers/volume23/21-0998/21-0998.pdf' },
            { label: 'LLM Compressor 量化方案', url: 'https://docs.vllm.ai/projects/llm-compressor/en/latest/guides/compression_schemes/' },
          ],
        },
      ],
    },
    {
      title: '投机解码补充',
      questions: [
        {
          question: 'DSpark 相比 DFlash 增加 Markov Head 和 Confidence Head 后，具体带来了什么收益？串行开销会抵消 Acceptance Length 的提升吗？怎么判断？',
          answer: 'Markov Head 提高每轮产出。它用上一个实际采到的 token 给当前 logits 加低秩转移偏置，让块内候选更连贯，后半段也更可能被接受。Confidence Head 节省验证预算。它估计每个位置的条件接受率，调度器用连乘得到前缀存活概率，结合负载裁掉低收益尾部。高并发时，这能把 Target 批容量留给更有希望通过的 token。最终仍由 Target 按原规则验收。\n\n串行开销可能抵消收益。设 T 是平均整轮耗时，L 是每轮平均实际输出 token 数，含 Target 补采或额外产出的 token。比较 T/L。DSpark 要更快，每轮耗时的增幅就得小于每轮产出的增幅。例如 DFlash 一轮 4 ms、产出 5 个 token，DSpark 若产出 6 个，整轮就要低于 4.8 ms 才更快。\n\n工程上对照 DFlash 固定宽度、DSpark 固定宽度、同一 DSpark checkpoint 开自适应验证三组。在同一硬件上固定 Target、精度、采样和长度分布，前两组用相同验证宽度，再扫并发。用 trace 拆草稿骨干、串行 head、调度及 Target Verify 耗时，同时报实际验证数、每轮输出、P95 TPOT 和总输出 tokens/s。裁短候选后若仍按原来的 padding 形状执行，Verify 时间也要靠实测确认。',
          example: {
            text: '论文里的量级（图 4、5）。草稿长度 γ=7 时，DSpark 相对 DFlash 的接受长度在数学、代码、聊天上分别提高 16%、15%、18%。在 batch=128 的延迟实验里，随块宽度从 4 到 16 变化，整轮额外耗时为 0.2%–1.3%。\n\nConfidence Head 的静态阈值实验把聊天任务的接受率从 45.7% 提到 95.7%。这个变化伴随验证 token 数减少，判断速度还要看实际输出和整轮耗时。',
          },
          sources: [
            dspark,
            { label: 'vLLM 投机解码指标', url: 'https://docs.vllm.ai/en/latest/features/speculative_decoding/acceptance_metrics/' },
          ],
        },
      ],
    },
  ],
});

interviewRounds.push({
  id: 'tencent-hunyuan-inference-infra',
  company: '腾讯混元',
  title: '推理 Infra 面试',
  keywords: ['分布式推理', '集合通信', '长上下文'],
  questions: [
    {
      question: 'Tensor Parallel 怎么切 Linear、Attention 和 FFN？通信发生在哪里？',
      answer: '先约定 PyTorch Linear 的权重 W=[out, in]，输出 Y=XWᵀ。名称按数学里的 X·A 来叫，其中 A=Wᵀ。Column Parallel 切输出维，即 W 切成 [out/p, in]，每张卡读同一份 X，各自产生一段输出。只有下游需要完整输出时才做 All-Gather。Row Parallel 切输入维，即 W 切成 [out, in/p]，每张卡用对应输入分片得到完整形状的部分和，然后按元素求和，常用 All-Reduce。\n\nAttention 的 Q/K/V 投影做 Column Parallel，按完整 head 分配。每张卡用自己的 Q head 和对应 K/V head 在本地做 Attention，输出投影 O 再做 Row Parallel，把各卡贡献归约成完整 hidden state。GQA 按 Q head 与 KV head 的分组关系切分。TP 大于 KV head 数时，常见实现会让部分 rank 复制同一个 KV head，具体取决于框架布局。\n\nFFN 的 up 投影做 Column Parallel，SwiGLU 的 gate 和 up 切在同一组中间通道，激活与逐元素乘法都在本地完成。down 投影接 Row Parallel，直接吃该分片，到末尾再归约。这样两层中间无需先 Gather 再切回去。经典复制 residual 的 TP 路径里，一个 Transformer block 通常在 Attention O 和 FFN down 各做一次归约。\n\nTP 加大能降低单卡权重占用和部分 GEMM 时间，但 collective 的固定时延、互联带宽、小分片的 kernel 效率和 KV head 复制都会影响收益。选 TP 时先满足显存，再按真实并发测 prefill 和 decode。',
      example: {
        text: 'TP=4 的例子。32 个 Q head、8 个 KV head，按组均匀切后每卡负责 8 个 Q head、2 个 K head 和 2 个 V head。FFN 若从 H=4096 扩到 F=11008，每卡先得到 [N, 2752] 的中间激活，down 投影各自产生 [N, 4096] 部分和。把四份部分和逐元素相加，就是完整输出。',
      },
      sources: [
        { label: 'Megatron-LM 论文', url: 'https://arxiv.org/abs/1909.08053' },
        { label: 'Megatron Core 线性层实现', url: 'https://docs.nvidia.com/megatron-core/developer-guide/latest/apidocs/core/core.tensor_parallel.layers.html' },
        { label: 'vLLM Llama QKV 分片示例', url: 'https://github.com/vllm-project/vllm/blob/main/vllm/model_executor/models/llama.py' },
      ],
    },
    {
      question: 'TP 中为什么用 All-Reduce、Reduce-Scatter 和 All-Gather？通信量怎么算？',
      answer: 'All-Reduce 把各卡的部分和加起来，每卡都得到完整结果。Reduce-Scatter 求和后每卡只保留结果的一段。All-Gather 把各卡已有的分片拼回完整 Tensor。TP 和 Sequence Parallel 组合时，可用 Reduce-Scatter 归约并按 token 保留分片，下一处需要完整 token 轴时再 All-Gather。\n\nRing All-Reduce。设 p 是 rank 数、S 是完整 Tensor 的字节数。Ring 分 Reduce-Scatter 和 All-Gather 两阶段，各走 p−1 步，每步每卡发 S/p，所以每卡共发 2(p−1)S/p，也收这么多。各卡流量均匀，大消息通常容易跑满带宽，例如大 prefill batch 的激活归约。小消息时，随 p 线性增长的通信步数更容易暴露启动时延。\n\nTree All-Reduce。以单棵树的整块归约和广播为例，每条父子边分别向上、向下传 S，按逻辑发送量计，p−1 条边的全组发送量也是 2(p−1)S。单卡发送量取决于它在树上的度数，叶子较轻，分支节点更忙。平衡二叉树沿关键路径的通信层数是 O(log p)，常适合小消息、rank 多、对时延敏感的 decode。NCCL 用两棵互补树各传一半数据，分摊分支节点上的流量。实际选择还取决于消息大小和互联拓扑。\n\n对 [B, Q, H] 激活，S=B×Q×H×每元素字节数。Q 是本次处理的 query token 数，普通单步 decode 常取 Q=1。连续批处理用实际调度的 token 总数乘 H 和元素大小。做 TP=2 / TP=4 对照时，固定 workload，看 Nsight 上关键路径的 NCCL 和等待时间。GEMM 已缩短而端到端表现停滞，并且主要时间花在等 collective 时，就进入了 Communication Bound。',
      example: {
        table: {
          caption: 'BF16 [4, 128, 4096]，完整 Tensor 为 4,194,304 Byte（4 MiB）',
          columns: ['发送量', 'TP=2', 'TP=4'],
          rows: [
            ['Ring All-Reduce / rank', '4 MiB', '6 MiB'],
            ['Ring Reduce-Scatter / rank', '2 MiB', '3 MiB'],
            ['Ring All-Gather / rank', '2 MiB', '3 MiB'],
            ['Ring / Tree All-Reduce 全组', '8 MiB', '24 MiB'],
          ],
        },
        text: 'TP=4 的 Ring 每卡发 6 MiB，也就是 6,291,456 Byte。若统计单卡发送加接收，则是 12 MiB。单树若以 0 为根、0 连 1 和 2、1 连 3，则四卡分别发送 8、8、4、4 MiB，合计也是 24 MiB。表里的全组量只加总发送。\n\nRing 的 Reduce-Scatter 或 All-Gather 单阶段每卡各发 (p−1)S/p。若 All-Gather 的 shape 给的是单卡分片 s Byte，先换成完整大小 S=p×s。',
      },
      sources: [
        { label: 'NCCL 集合通信定义', url: 'https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/api/colls.html' },
        { label: 'NCCL Tests 流量计算', url: 'https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md' },
        { label: 'NCCL 双二叉树', url: 'https://developer.nvidia.com/blog/massively-scale-deep-learning-training-nccl-2-4/' },
        { label: 'Nsight Systems 分析文档', url: 'https://docs.nvidia.com/nsight-systems/AnalysisGuide/' },
      ],
    },
    {
      question: 'Serving DP 和 TP 有什么区别？什么时候该增加 DP？',
      answer: 'TP 让同一请求的每层计算分布到多卡，卡间交换激活。一套 DP 副本则有完整的逻辑模型，可由一张卡承载，也可由一个 TP/PP 组承载。Serving DP 把不同请求路由到不同副本，每个副本独立调度 batch、维护自己的 KV Cache。副本同时工作，所以总吞吐上升。\n\n单请求在同样的副本里执行，增加 DP 通常不会缩短它的前向时间。高负载时，多副本有机会减少排队，从而改善 TTFT 和端到端延迟。若单卡放不下模型，单纯多复制几份依然放不下，需要用 TP、PP 或量化降低每个设备的占用。\n\n如果一套副本已经放得下模型，且单请求延迟达到目标，容量不足时优先增加 DP。如果主要问题是单副本显存或单请求计算时间，再比较增大 TP 的收益与通信代价。训练里的标准 DDP 用不同数据做前向和反向，需要同步梯度。Serving DP 做的是请求并行。MoE 若同时开 EP，专家可能跨 DP ranks 分片并交换 token，性能还要看这部分通信。',
      sources: [
        { label: 'vLLM Serving DP', url: 'https://docs.vllm.ai/en/latest/serving/data_parallel_deployment/' },
        { label: 'vLLM Expert Parallel', url: 'https://docs.vllm.ai/en/latest/serving/expert_parallel_deployment/' },
        { label: 'Megatron 并行策略', url: 'https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html' },
      ],
    },
    {
      question: 'Pipeline Parallel 怎么切模型？为什么推理实现复杂？',
      answer: 'PP 按模型深度切 stage。每个 stage 放连续的若干层和这些层的 KV Cache，stage 之间通过 P2P 传激活。划分时按目标 workload 实测每段的时间和显存，embedding、LM head、MoE 层和 KV 大小都可能让平均分层失衡。稳态流水节拍主要由最慢的 stage 决定。\n\nMicro-batch 是一次进入流水线的一小批请求或 token。第一个 micro-batch 刚进入时，后面的 stage 要等。最后一个进入后，前面的 stage 会先空下来。这些填充和排空时间就是 bubble。理想情况下 p 个等时 stage 处理 m 个 micro-batch，需要 m+p−1 个时间槽，bubble 比例为 (p−1)/(m+p−1)。可以用更多独立 micro-batch 填满流水线、按实测成本重切 stage，并尝试把 P2P 搬运与计算重叠。\n\n一个请求的 token 仍要依次通过各 stage，跨 stage 传输和等待会进入延迟。自回归 decode 还要等尾 stage 给出 token，才能发起对应请求的下一步，流水线通常靠其他请求把空位填起来。\n\n实现里要同时处理分层加载、可变长度 micro-batch 的调度、异步收发顺序、跨 stage 对齐请求 ID 和 KV slot、尾 stage 采样回传，以及完成或取消后的状态回收。面试追问是否做过 PP 时，具体讲自己负责过哪一段和怎样验证。',
      example: {
        text: '4 个等时 stage 只跑 1 个 micro-batch 时，理想 bubble 是 3/4。跑 8 个时降到 3/11，约 27%。实测还要算 stage 不平衡、传输，以及 micro-batch 变小后 GEMM 效率的变化。',
      },
      sources: [
        { label: 'GPipe 流水线论文', url: 'https://arxiv.org/abs/1811.06965' },
        { label: 'Megatron Pipeline 调度与 P2P', url: 'https://docs.nvidia.com/megatron-core/developer-guide/latest/api-guide/core/pipeline_parallel.html' },
      ],
    },
    {
      question: 'Context Parallel 为什么适合长 Context？切开 Sequence 后怎么做 Attention？',
      answer: 'CP 按序列位置把同一条请求分到多卡。Prefill 均匀分 p 份后，每卡负责约 1/p 的 query 位置，并保存对应的持久 KV 分片。Prefill 可以先 All-Gather K/V 再算，也可以用 Ring Attention。Ring 中每卡保留本地 Q，K/V block 沿环传递。每收到一块就做局部 Attention，用全局位置施加因果 mask，再用 online softmax 合并。全局 dense attention 的计算量仍是 O(L²)。\n\nDecode Context Parallel 在 vLLM 的常见路径里先 All-Gather Q。TP 先产生本地 Q head 分片，DCP 组内沿 head 维把它们拼起来。历史 KV 继续按序列留在各卡，各卡用拼好的 Q 读自己的 KV 分片。Decode 每轮的 query token 少，移动 Q 的开销通常比搬整个历史 KV 小。MLA 若启用了组内 Q 投影复制，每卡已拿到组内 Q，可以省掉这次 Gather。\n\n每个 query/head 的局部 Attention 要同时保留局部输出 Oᵢ 和本地 softmax 的 LSEᵢ（log-sum-exp）。以 vLLM 的 ag_rs 路径为例，先 All-Gather LSE，求出全局 LSE，用 exp(LSEᵢ−全局 LSE) 缩放各卡自己的 Oᵢ，再 Reduce-Scatter 求和并把输出按 head 分回各卡。如果后面还要和另一段 KV 合并，就保留本次的全局输出和全局 LSE。',
      example: {
        text: '以同一个 query/head 为例。若局部 kernel 留下的是未归一化的加权和 uᵢ=Σexp(score−mᵢ)·V，就同时保存最大分数 mᵢ 和指数和 lᵢ=Σexp(score−mᵢ)。这三项可以换成已归一化的局部输出 Oᵢ=uᵢ/lᵢ 和 LSEᵢ=mᵢ+log(lᵢ)。\n\n跨卡更新时，全局 LSE=logsumexp(LSEᵢ)，全局输出 O=Σ exp(LSEᵢ−全局 LSE)·Oᵢ。等价地，也能先取 m=max(mᵢ)，把局部分子 uᵢ 和分母 lᵢ 乘上 exp(mᵢ−m)，分别求和后再相除。空分片或全 mask 的分片取零权重。',
      },
      sources: [
        { label: 'Megatron Context Parallel', url: 'https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/features/context_parallel.html' },
        { label: 'Ring Attention 论文', url: 'https://arxiv.org/abs/2310.01889' },
        { label: 'vLLM Context Parallel 部署', url: 'https://docs.vllm.ai/en/latest/serving/context_parallel_deployment/' },
        { label: 'vLLM DCP 的 Q Gather 流程', url: 'https://github.com/vllm-project/vllm-project.github.io/blob/main/_posts/2026-08-07-decode-context-parallelism.md' },
        { label: 'vLLM DCP 的 LSE 合并代码', url: 'https://github.com/vllm-project/vllm/blob/main/vllm/v1/attention/ops/dcp.py#L441-L503' },
      ],
    },
  ],
});

interviewRounds.push({
  id: 'tencent-hunyuan-kernels-kv-routing',
  company: '腾讯混元',
  title: '算子与 KV Cache 路由',
  keywords: ['Blackwell', 'Dynamo', 'W4A4'],
  questions: [
    {
      question: 'Ampere、Hopper、Blackwell 的 Tensor Core 指令和异步调度怎么演进？',
      answer: 'Ampere（以 A100 为例）的计算主体是 warp 级 mma.sync，源片段和累加器在寄存器中。搬运侧用 cp.async 把数据从 Global Memory 异步拷到 Shared Memory，再通过 commit/wait group 做多级缓冲。常见 Tensor Core 路径增加了 BF16、TF32 和 2:4 结构化稀疏支持。\n\nHopper（H100）把搬运和计算都做成更大粒度的异步操作。TMA 用 tensor map 描述多维 Tile，由一个线程发起批量搬运，用 mbarrier 通知消费者。WGMMA（wgmma.mma_async）由 4 个 Warp 协同发射，常见路径用 shared-memory descriptor 读操作数，部分指令也支持 A 从寄存器读取，累加器仍分布在寄存器。Producer 搬数据，Consumer 算 MMA，用 barrier 和 WGMMA 的 commit/wait 控制阶段推进。Hopper 还加入 FP8 E4M3/E5M2 的计算路径。\n\nBlackwell 数据中心 SM100 延续 TMA，改用 tcgen05.mma（常称 UMMA）异步执行矩阵乘加。一个线程可以触发整块运算，累加器放进 Tensor Memory（TMEM），完成后再由 epilogue 读出。Block-scaled 路径支持 FP4/FP6 等低精度格式，Tensor Core 在乘加时按 K 方向的微块消费 scale。实际指令、形状和数据类型要按目标 SM 选。',
      sources: [
        { label: 'NVIDIA Ampere Tuning Guide', url: 'https://docs.nvidia.com/cuda/ampere-tuning-guide/index.html' },
        { label: 'NVIDIA Hopper Tuning Guide', url: 'https://docs.nvidia.com/cuda/hopper-tuning-guide/index.html' },
        { label: 'PTX ISA', url: 'https://docs.nvidia.com/cuda/parallel-thread-execution/' },
        { label: 'CUTLASS tcgen05 指南', url: 'https://docs.nvidia.com/cutlass/4.5.2/media/docs/pythonDSL/mma_docs/tcgen05_programming.html' },
      ],
    },
    {
      question: 'Hopper 的 WGMMA 要 Warp Group 发射，Blackwell 的 UMMA 为什么能由单个线程发射？TMEM 上怎么用 Scale Factor？',
      answer: 'WGMMA 的发射和寄存器片段都按 Warp Group 定义，4 个连续 Warp 的 128 个线程要参与同一次指令。SM100 的 tcgen05.mma 把操作数位置和 Tile 布局交给描述符，累加结果写到 TMEM，由硬件执行整块运算。常见写法是安排一个 MMA Warp，再用 elect.sync 选一个 lane 发射，精确口径是单线程发射。TMEM 分配和结果读取仍有自己的 Warp 协作要求，整个 kernel 也依然要有人搬运、同步和做 epilogue。\n\n每轮 K-Tile 通常先把 A、B、SFA、SFB 搬到 Shared Memory，再按指令布局用 tcgen05.cp 把 A/B 的 block scale 写到 TMEM。发 tcgen05.mma.block_scale 时传入 A/B 的描述符、SFA/SFB 的 TMEM 地址以及 D 累加器的 TMEM 地址。Tensor Core 按相应 K 子块先应用两边的 scale，再乘加。MMA 完成后通过 commit/barrier 同步，epilogue 再读 TMEM。\n\n以常见格式为例，MXFP4 用 E2M1，MXFP6 可用 E2M3 或 E3M2，两者都是每 32 个元素用一个 E8M0 block scale。NVFP4 的典型配方是 FP4 E2M1，每 16 个元素用一个 E4M3 block scale，并有 tensor 级 FP32 scale。若该全局 scale 在配方里单独存放，可以合进 GEMM 的 alpha 或 epilogue。',
      example: {
        text: '逻辑 K=64 的例子。按 16 元素一块的 scale，会有 4 个分别缩放的 K 段。每段乘积的权重是它自己的 sA×sB，输出是这些带权部分和的累加。只有整个归约维共用同一个比例时，才可以把这个比例统一提到累加结束后。',
      },
      sources: [
        { label: 'PTX 指令发射和 TMEM 语义', url: 'https://docs.nvidia.com/cuda/parallel-thread-execution/' },
        { label: 'CUTLASS block-scaled MMA 指南', url: 'https://docs.nvidia.com/cutlass/4.5.2/media/docs/pythonDSL/mma_docs/tcgen05_programming.html' },
        { label: 'CUTLASS SM100 NVFP4 GEMM', url: 'https://github.com/NVIDIA/cutlass/blob/main/examples/72_blackwell_narrow_precision_gemm/72b_blackwell_nvfp4_nvfp4_gemm.cu' },
        { label: 'OCP MX 格式规范', url: 'https://www.opencompute.org/documents/ocp-microscaling-formats-mx-v1-0-spec-final-pdf' },
        { label: 'NVIDIA NVFP4 格式', url: 'https://docs.nvidia.com/deeplearning/transformer-engine-releases/release-2.19/features/low_precision_training/nvfp4/nvfp4.html' },
      ],
    },
    {
      question: 'Cache-aware 路由怎么避免热点实例？λ 怎么定，跨实例共享 KV 又怎么做？',
      answer: '只按最长可复用前缀选 worker，热门前缀会把请求集中到已有副本，排队时间可能超过省下的 prefill 时间。可以用 scoreᵢ=λ·Cᵢ+(1−λ)·Lᵢ，λ 在 0 到 1 之间，C 是归一化的缓存收益，L 是归一化的负载余量，分数越高越优先。缓存收益可按可复用 token 折算成预计省下的时间，负载可结合排队 prefill tokens、活跃 decode blocks 和可用 KV 容量。临近饱和的实例先做限流或过滤。\n\nλ 用同一批 trace 回放选定。扫并发、热前缀比例和输入输出长度，看 P95 TTFT、P95 ITL、SLO 以内的 goodput，以及按 token 统计的前缀命中率。适度降低缓存权重会牺牲部分本地命中，但可能显著减少尾延迟。线上可随负载调权重，并加平滑或滞回来避免抖动。\n\n跨实例共享要分为查索引和搬数据。索引记录可复用前缀及缓存位置。数据面可以拉取兼容的远端 KV 块，也可以给高频前缀扩副本。先校验模型版本、token 前缀、位置语义、KV 布局与租户隔离，再比较复制或加载时间和重算时间。NIXL 可承担数据搬运，实际复用需要推理引擎的 KV Connector 接入。\n\nDynamo 已经将前缀命中抵扣到 prefill 成本，再与潜在 decode blocks 和可选的活跃请求成本合并，还支持按负载衰减命中权重。公开的 kvcr 策略也会给可从 peer 拉取的块计分。可以对比的扩展是把命中、排队和链路开销都折成预计毫秒，并按热前缀控制副本数。用同一套 trace 对照 Dynamo 的基线，再报告 SLO 和成本差异。',
      example: {
        text: '例如走热门实例可再省 8 ms prefill，但会多排队 20 ms。对当前请求来说，预计 TTFT 更好的就是轻载实例。若同一个前缀反复出现，再比较把 KV 复制到轻载实例的一次性成本与后续请求能省下的重算时间。',
      },
      sources: [
        { label: 'Dynamo Router 成本函数与 KV 事件', url: 'https://docs.nvidia.com/dynamo/dev/knowledge-base/modular-components/router/router-design' },
        { label: 'Dynamo 路由权重与 kvcr', url: 'https://docs.nvidia.com/dynamo/dev/knowledge-base/modular-components/router/configuration-and-tuning' },
        { label: 'Dynamo KVBM 与传输配置', url: 'https://docs.nvidia.com/dynamo/dev/reference/components/kvbm-configuration' },
      ],
    },
    {
      question: '英特尔 TILE Cache 仿真按哪些系统层级建模？怎么给客户估并行配置和 PD 配比？',
      answer: '这题可以按设备、引擎、集群三层答。设备层先定义 TILE 对应的建模粒度。若模拟的是 Intel Xe GPU 的硬件 tile，就量出 tile 内缓存、HBM 和跨 tile 链路的容量、带宽与延迟，并用算子 microbenchmark 标定不同 shape 和精度的耗时。若项目按 KV tile 建模，则重点记录每块的大小、分配、命中、淘汰和传输。具体粒度按项目定义给出。\n\n引擎层做离散事件回放。输入请求到达时间、前缀、输入和输出长度，在仿真中触发入队、组 batch、Prefill、KV 搬运和逐轮 Decode。把算子 profile、集合通信和缓存占用接进每个事件的成本模型。集群层再组合 TP/PP/DP、P/D 实例数、网卡拓扑和路由，统计 P95 TTFT、P95 TPOT、goodput 与资源占用。\n\n给客户配比时，先用到达率和单实例实测容量估 P/D 数量，再把附近几组配置放进模拟器对照。验收条件是满足 SLO 和目标 goodput 后，尽量降低卡数与成本。最后选少量候选做实机校准，交付配置表、适用的流量范围和仿真误差。',
      example: {
        text: '举例用一组假设值。请求到达率 20 req/s，每条平均生成 100 token，Prefill 实例处理 8 req/s，Decode 实例生成 500 tok/s。容量起点可以取 P≥⌈20/8⌉=3、D≥⌈2000/500⌉=4。然后用流量突发、命中率和 P→D 的 KV 链路带宽验证这组配置是否留足了尾延迟余量。',
      },
      sources: [
        { label: 'Intel GPU 多 Stack / Tile 架构', url: 'https://www.intel.com/content/www/us/en/docs/oneapi/optimization-guide-gpu/2024-1/multi-tile-arch.html' },
        { label: 'Vidur 推理系统仿真论文', url: 'https://arxiv.org/abs/2405.05465' },
        { label: 'DistServe P/D 配置与 Goodput', url: 'https://arxiv.org/abs/2401.09670' },
      ],
    },
    {
      question: 'W4A4 稀疏 Kernel 怎么实现？4 Tile 共用 Bitmap、Split-K、双缓冲和 M16N8K64 各起什么作用？',
      answer: '先明确数据格式。以 INT4×INT4 为例，权重可做对称 per-channel 或 per-group 量化，激活可做 per-token 量化，Tensor Core 做整数乘加并累加到 INT32。K 方向若用不同 group scale，各组要保留部分和，按各自 sW×sA 缩放后再合并。若一整行/列在 K 上共用 scale，可以在 epilogue 统一处理。\n\nM16N8K64 是单次 MMA 的计算形状：16×64 和 64×8 的片段产出 16×8 的部分和，K=64 个 INT4 元素对应 32 Byte 的原始一维数据。WMMA API 提供 warp 级 fragment 操作。这个形状的具体 PTX 路径可用 mma.sync.aligned.m16n8k64 的 s4/s32 变体。CTA 的输出 Tile 可由多个这种指令 Tile 组成，选型时要看小 batch 下的 padding 和并行度。硬件 mma.sp 需要指令规定的结构稀疏和元数据编码。软件 Bitmap 可以先展开成密集片段，再走普通 MMA。\n\n4 Tile 共用 1 Bitmap 可以用一个示例布局解释：一份 Bitmap 里分出四个 Tile 各自的 bit 区间，同时给出每个 Tile 的非零值起点或可推导的前缀计数。某位置的 bit 为 1 时，用该 Tile 的非零起点加上前面 bit 的 popcount，定位 packed INT4 值，再把它填回目标 fragment。这样能合并元数据读取并摊薄头部开销。若仍是一位置一位，四个 Tile 合放不会减少原始 mask 的位数，收益要实测。\n\n算子流水线可以把下一块的 Bitmap、压缩权重和激活异步预取到另一组缓冲，在当前块上解码、重建稠密片段并发 MMA，等消费者释放缓冲后才继续写入。这样就把题面里的 LSBD 落到「稀疏加载 → 重建 → 密集乘加」的三个阶段。GEMM 的 Split-K 沿归约轴把 K 段分给不同 CTA，小 batch 下能增加可并行工作，但要付出部分和的额外归约。Split-K 也要配合量化组边界。\n\n典型适用场景是小 batch Decode、权重带宽成为瓶颈且稀疏率足够高。用同精度 Dense W4A4 做基线，比较实际 HBM 字节、解码与同步成本、端到端延迟和精度。四 Tile 的具体编码规则或加速比用真实项目数据说明。',
      example: {
        text: '若每个 INT4 权重位置用 1 bit mask，密度为 d，光非零值和 mask 就约占 0.5d+0.125 Byte/位置。要比密集 INT4 的 0.5 Byte 小，理想情况下稀疏率得超过 25%。实际还要算 offset、对齐和解码，越过这个存储阈值后还要测性能。',
      },
      sources: [
        { label: 'PTX 的 INT4 MMA 与稀疏元数据', url: 'https://docs.nvidia.com/cuda/parallel-thread-execution/' },
        { label: 'Flash-LLM 稀疏加载与密集计算', url: 'https://arxiv.org/abs/2309.10285' },
        { label: 'SpInfer Bitmap 编码论文', url: 'https://www.cse.ust.hk/~weiwa/papers/eurosys25-fall-spinfer.pdf' },
      ],
    },
  ],
});

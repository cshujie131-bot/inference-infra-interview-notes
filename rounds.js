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
      answer: 'All-Reduce 把各卡的部分和加起来，每卡都得到完整结果。Reduce-Scatter 也先求和，每卡只保留结果的一段。All-Gather 把各卡已有的分片拼回完整 Tensor，拼接本身无需相加。比如 TP 和 Sequence Parallel 组合时，可用 Reduce-Scatter 归约并按 token 保留分片，在下一处需要完整 token 轴的线性层前再 All-Gather。\n\n设 p 是 TP rank 数，S 是完整逻辑 Tensor 的字节数。按 Ring 算法，每 rank 的单向发送量为 All-Reduce 2(p−1)S/p，Reduce-Scatter 或 All-Gather 各 (p−1)S/p。接收量与发送量相同。All-Gather 如果给的是本地分片字节数 s，先换算 S=p×s。这个口径忽略协议开销，其他 collective 算法和拓扑会改变实际耗时。\n\n对 [B, Q, H] 激活，S=B×Q×H×每元素字节数。Q 是这次参与计算的 query token 数，普通单步 decode 常取 Q=1。连续批处理用实际调度的 token 总数乘 H 和元素大小。做 TP=2 / TP=4 对照时固定 workload，看 Nsight 上关键路径暴露了多少 NCCL 和等待时间。如果 GEMM 已缩短而 TPOT 或吞吐不再改善，且增加的时间落在 collective 或等其他 rank 上，就能确认通信开始主导。',
      example: {
        table: {
          caption: 'BF16 [4, 128, 4096]，完整 Tensor 为 4,194,304 Byte（4 MiB）',
          columns: ['Ring 发送量', 'TP=2', 'TP=4'],
          rows: [
            ['All-Reduce / rank', '4 MiB', '6 MiB'],
            ['Reduce-Scatter / rank', '2 MiB', '3 MiB'],
            ['All-Gather / rank', '2 MiB', '3 MiB'],
            ['All-Reduce 全 ranks', '8 MiB', '24 MiB'],
          ],
        },
        text: '例如 TP=4 的 All-Reduce 每卡发送 2×3/4×4 MiB=6 MiB，也就是 6,291,456 Byte。若统计每卡发送加接收，则是 12 MiB。小消息还可能主要耗在每轮启动与同步，因此同时看时延和带宽。',
      },
      sources: [
        { label: 'NCCL 集合通信定义', url: 'https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/api/colls.html' },
        { label: 'NCCL Tests 流量计算', url: 'https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md' },
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
      answer: 'CP 按序列位置把同一条请求分到多卡。Prefill 均匀分 p 份后，每卡只负责约 1/p 的 query 位置，并保存对应的持久 KV 分片，减轻单卡显存和计算压力。完整 Attention 仍要让每段 Q 看见因果范围内的所有 K/V，所以每卡算本地 Q 时要从其他卡取对应的 K/V，或汇总远端算出的部分结果。\n\nPrefill 可以先 All-Gather K/V 再算，也可以用 Ring Attention。Ring 中每卡保留本地 Q，K/V block 沿环传递。收到一块就做一次局部 Attention，用全局位置施加因果 mask，并通过 online softmax 合并结果。这样无需在每卡同时物化完整 K/V，全局 dense attention 的计算量仍是 O(L²)。\n\nDecode 的常见做法是把历史 KV 按位置分片，各卡拿到对应的当前 Q 后，读自己的 KV 分片，产生局部 Attention 统计量。一种合并方式是先跨卡求 MAX，再按该最大值缩放并用 SUM 合并分子和分母。此时主要省的是每卡 KV 容量和读取量，要和新增通信一起衡量。',
      example: {
        text: '以某一个 query row 为例。每块先算最大分数 mᵢ、指数和 lᵢ=Σexp(score−mᵢ)，以及未归一化的加权值 uᵢ=Σexp(score−mᵢ)·V。令 m=max(mᵢ)，再用 exp(mᵢ−m) 把每块的 lᵢ 和 uᵢ 换到同一个基准。最终输出是 Σ[exp(mᵢ−m)·uᵢ] ÷ Σ[exp(mᵢ−m)·lᵢ]。整块都被 mask 的块可跳过。这样跨卡合并时保留了全局 softmax 的归一化系数。',
      },
      sources: [
        { label: 'Megatron Context Parallel', url: 'https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/features/context_parallel.html' },
        { label: 'Ring Attention 论文', url: 'https://arxiv.org/abs/2310.01889' },
        { label: 'vLLM Context Parallel 部署', url: 'https://docs.vllm.ai/en/latest/serving/context_parallel_deployment/' },
      ],
    },
  ],
});

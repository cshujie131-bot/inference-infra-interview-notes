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

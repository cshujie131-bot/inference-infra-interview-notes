// 每场面试一条记录。id 固定且唯一，round 和 date（YYYY-MM-DD）可省略。
// keywords 只显示在场次标题旁。每题先写 answer，再用 note 补充细节。
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
        note: {
          text: '比较的是每个输出 token 的成本，约为（起草时间 + 验证时间 + 额外开销）÷ 每轮实际产出 token 数。低 batch、decode 受显存带宽限制时通常更容易获益。',
        },
        sources: [speculativeSampling],
      },
      {
        question: '投机解码采样中怎么保证最终输出分布与 Target Model 一致？',
        answer: '把草稿多报的概率裁掉，再把空出来的概率补给少报的 token。给定同一前缀，设 p 是目标分布、q 是草稿分布。对草稿候选 x，以 min(1, p(x)/q(x)) 接受，直接留下的概率质量是 min(p(x), q(x))。拒绝时按缺口 [p−q]₊ 归一化后补采样。两部分相加刚好是 p，逐位置成立就保证了整段序列分布一致。',
        note: {
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
          text: '先看拒绝。把同一个前缀独立跑 100 次，期望 Draft 提议 A 70 次。A 只按 50/70 的概率通过，所以留下 50 次、拒绝 20 次。B、C 的提议概率低于目标概率，它们一旦被提议就直接接受，分别留下 20 次和 10 次。\n\n再看补缺口。20 次拒绝恰好对应总共 20 个百分点的缺口。B、C 各缺 10 个百分点，所以在拒绝这个分支里各以 50% 的概率补采。期望各补 10 次，最后得到 A 50、B 30、C 20，恰好是目标分布。\n\n验证一个候选块时，首次拒绝后要丢弃剩余草稿，因为它们基于已经改变的前缀。全接受时，可直接用这次验证算出的目标分布再采一个 bonus token。计算 p、q 时使用各自应用 temperature、top-p 等规则后的实际采样分布。',
        },
        sources: [speculativeSampling],
      },
      {
        question: 'DSpark 相比 DFlash 做了哪些改进？',
        answer: 'DFlash 把 Target 多层特征投影成各 Draft 层的上下文 KV，用一次 block diffusion 前向并行预测整个候选块。DSpark 保留并行骨干，然后用轻量的 Markov head 串行修正每个位置的 logits，让后一个候选能根据前一个实际采到的 token 调整。再由 confidence head 预测条件接受率，结合负载决定每条请求值得验多长。',
        note: {
          text: 'DFlash 的一次前向会为所有 Mask 位置给出 logits。比如两位分别偏好 New / San 和 York / Francisco，第二位的 logits 在第一位实际采样之前就已算完。\n\nMarkov head 按上一个 token 修分数。第一位采到 New 时，第二位就可以给 York 加分。实现上是「并行骨干 logits + 上一个 token 对整个词表的转移偏置」。转移矩阵做低秩分解，先查上一 token 的 embedding，再投影到词表。骨干仍然只跑一次。\n\nConfidence head 用当前位置的骨干 hidden state 和上一个 token 的 Markov embedding，经线性层和 sigmoid 预测这一位在前面都通过时的接受率。训练目标来自 Draft 和 Target 分布的重叠度，也就是 Σ min(p, q)。若前两位的条件接受率是 90% 和 60%，两位都通过的概率约为 54%。调度器结合这些概率和当前批大小下的实测验证步频，决定每个请求验几位。最终仍按 Target 的精确规则验收。',
        },
        sources: [dspark, dflash],
      },
      {
        question: '投机解码在工程实现中如何管理 Draft Model 和 Target Model 的 KV Cache？',
        answer: '同一个请求维护一条已提交 token 前缀。独立 Draft 和 Target 各写各层的 KV，调度层可以共用分配器。候选前向生成的 KV 先写临时 slot，验证后提交接受前缀，回退逻辑长度并回收或复用拒绝后缀的 slot。树验证只保留命中路径，必要时重排该路径上的 KV。',
        note: {
          text: '拒绝时补采样的 token 或全接收后的 bonus token 已进入输出序列，但通常在下一轮输入前向后才有对应 KV。DFlash 会把 Target 的多层 hidden features 投影成各 Draft 层自己的 K/V，再缓存复用。',
        },
        sources: [dflash, { label: 'TensorRT-LLM 投机解码实现说明', url: 'https://github.com/NVIDIA/TensorRT-LLM/blob/main/docs/source/features/speculative-decoding.md' }],
      },
      {
        question: 'EAGLE3、DSpark、DFlash 三种方法的最终结果是什么？',
        answer: 'DSpark 论文表 1 用 Qwen3-4B、temperature=1、链式起草，关闭置信度调度。按 EAGLE-3 / DFlash / DSpark 顺序，每轮平均产出（含目标补出的 1 token）在 GSM8K 是 5.14 / 5.40 / 6.11，在 MT-Bench 是 2.39 / 3.07 / 3.64。',
        note: {
          text: '速度要看各自口径。DFlash 论文用 Qwen3-4B、temperature=1，块大小为 16 时，平均 decode 加速 4.24×。EAGLE-3 的树大小为 16 时是 1.72×，两者都以逐 token 解码为基线。DSpark 线上以 MTP-1 为基线，DeepSeek-V4-Flash 在同等总吞吐下，单用户生成速度提升 60%–85%。\n\n个人实测待补。回答个人项目时，报三种方法在同一套模型、硬件和流量下的接受长度、TPOT、输出吞吐，以及相对同一基线的端到端加速比。',
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
        note: {
          text: '基线关闭投机解码，固定 Target、硬件、采样和长度分布，再扫并发。流式一次可能送出多个 token，chunk 间隔和单 token 延迟要注明口径。',
        },
        sources: [{ label: 'vLLM 投机解码指标', url: 'https://docs.vllm.ai/en/latest/features/speculative_decoding/acceptance_metrics/' }],
      },
      {
        question: 'EAGLE3 的 Tree Construction 和 Tree Attention 是怎么实现的？',
        answer: '构树沿用 EAGLE-2 的动态树。Draft 从同一个前缀提出多条候选路径，用路径累计概率选择扩展的分支，最后按节点预算裁剪。验证时把整棵树摊平，一次送给 Target。Tree Attention 保证每个节点只能看已确认前缀、自己的祖先和自己，位置编号按树深度计算。这样可以一次算出多条路径各自的 next-token logits。',
        note: {
          tree: '已确认前缀 → r\n             ├─ A\n             │  ├─ A1\n             │  └─ A2\n             └─ B\n                └─ B1',
          text: '怎么构树。r 是 Target 已选出的起始 token，Draft 用 Target 低、中、高层融合特征和 token embedding 起步。每个活跃节点提出 top-k 子节点，子节点的分数等于父路径累计 log-prob 加当前条件 log-prob。比如 A 的概率是 0.6，A1 给定 A 是 0.5，这条路径得 0.30。B 的概率是 0.4，B1 给定 B 是 0.9，路径得 0.36，所以 B1 值得优先扩展。最后按全局节点预算裁剪，同时记录父节点索引。\n\nTree Attention 怎么做。假设摊平顺序是 [r, A, B, A1, A2, B1]。普通因果 mask 会让 A1 看到前面的 B，导致它的上下文串进另一条路径。树 mask 让 A1 只能看已确认前缀和 [r, A, A1]，让 B1 只能看已确认前缀和 [r, B, B1]。若前缀长度为 L，r 的 position ID 是 L，A 和 B 都是 L+1，三个叶子都是 L+2。扁平索引用来存储，树深度用来确定位置。\n\n怎么提交。参考实现用 retrieve_indices 把扁平 logits 映射回根到叶的路径。贪心时，如果 r 的 logits 选 A，A 的 logits 选 A2，就保留 r → A → A2 上已经算好的 KV，其余候选位置可复用。随机采样则按树的验证规则决定保留哪条前缀。',
        },
        sources: [eagle3, { label: 'EAGLE-3 构树代码', url: 'https://github.com/SafeAILab/EAGLE/blob/main/eagle/model/cnets.py#L670-L807' }, { label: '树验证与 KV 提交代码', url: 'https://github.com/SafeAILab/EAGLE/blob/main/eagle/model/utils.py#L306-L449' }],
      },
      {
        question: 'RTN、SmoothQuant、AWQ 三种量化方法的核心区别是什么？',
        answer: 'RTN 在给定 scale 和量化范围后，把值映射到最近的格点。权重量化时可以只用权重统计。SmoothQuant 面向 INT8 W8A8，用等价变换 XW = (XD⁻¹)(DW)，把 activation outlier 的量化难度转移到更容易量化的权重。原始 AWQ 主要做低比特 weight-only（常见 W4A16），用激活统计识别重要输入通道，通过逐通道缩放和权重量化降低输出误差，运行时激活保持高精度。',
        note: {
          text: 'AWQ 论文用保留约 1% 显著权重为高精度验证了现象，实际方法用通道缩放保护这些权重。RTN 可作为缩放后的量化步骤。',
        },
        sources: [{ label: 'SmoothQuant 论文', url: 'https://proceedings.mlr.press/v202/xiao23c.html' }, awq],
      },
      {
        question: '你的 AWQ-FP8 相比原始 AWQ 做了哪些改进？',
        answer: '可以从校准目标和执行路径答。原始 AWQ 主要优化低比特权重误差。如果你的方案是 FP8 W8A8，就解释如何用激活感知缩放降低权重与激活共同量化后的误差。对比实际采用的 FP8 格式、权重与激活 scale 粒度、静态或动态缩放，再说明缩放如何融合、线性层如何接入原生 FP8 GEMM，以及敏感层如何处理。',
        note: {
          text: '简历细节待补。给出实际量化的层和 dtype、校准数据与目标、kernel 路径，以及相对 BF16、原始 AWQ、普通 FP8 的精度与延迟消融。',
        },
        sources: [awq, fp8],
      },
      {
        question: '为什么 FP8 W8A8 量化之后，端到端加速比只有 1.2～1.3×？',
        answer: '端到端收益取决于加速覆盖率。如果基线 40% 的时间在可提速的 GEMM 上，即使这些 GEMM 快 2×，整体也只有 1 ÷ (0.6 + 0.4/2) = 1.25×。FP8 W8A8 主要加速走 FP8 kernel 的线性层，运行时还要看 attention/KV 访存、通信、调度、激活量化和小 shape 下的利用率。',
        note: {
          text: '实测归因待补。按 prefill 和 decode 拆 trace，比较 BF16 与 FP8 的 GEMM 占比、算子时间和额外量化开销，并确认是否走原生 FP8 kernel。固定输出长度，分别测低并发与目标吞吐下的延迟。',
        },
        sources: [fp8],
      },
    ],
  },
];

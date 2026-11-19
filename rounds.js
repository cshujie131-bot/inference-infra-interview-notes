// 每场面试追加一条记录。id 固定且唯一，round 可填「一面」「二面」。
// 公司未知时可填「待归类」。date（YYYY-MM-DD）和 sources 可省略。
// 只有示例题使用 example: true。每题写 1–3 句简答。
const interviewRounds = [
  {
    id: 'example-decoding',
    company: '通用示例',
    round: '主题练习',
    title: '推理引擎与投机解码',
    example: true,
    tags: ['投机解码', 'KV Cache'],
    questions: [
      {
        question: '投机解码为什么能加速，又如何保持目标模型的采样分布？',
        answer: '小模型先起草多个 token，大模型一次前向并行验证。对候选 token 按 min(1, p/q) 接受，拒绝时从归一化的 max(p−q, 0) 中重采样，其中 p、q 分别是目标和草稿分布。',
      },
      {
        question: '什么情况下投机解码可能越做越慢？',
        answer: '接受率低、草稿模型开销大，或者目标模型已经在大 batch 下接近饱和时，省下的串行步数可能抵不过额外开销。实测应同时看每轮产出的 token 数、ITL 和吞吐。',
      },
      {
        question: 'Prefix caching 省的是什么？',
        answer: '在缓存命中时，复用相同输入前缀的 KV，跳过该前缀的 prefill 计算。主要改善 TTFT，对剩余 token 的逐步 decode 计算没有直接影响。',
      },
    ],
    sources: [
      { label: 'Speculative Decoding 论文', url: 'https://arxiv.org/abs/2211.17192' },
      { label: 'vLLM Prefix Caching', url: 'https://docs.vllm.ai/en/stable/features/automatic_prefix_caching/' },
    ],
  },
  {
    id: 'example-parallelism',
    company: '通用示例',
    round: '主题练习',
    title: '分布式推理与并行策略',
    example: true,
    tags: ['并行', 'MoE'],
    questions: [
      {
        question: '推理时 TP、PP、DP 分别切什么？',
        answer: 'TP 切层内张量，通常要做层内集合通信。PP 按层切模型，在相邻 stage 之间传激活。DP 复制模型、分摊请求，主要用于扩吞吐。',
      },
      {
        question: '为什么 TP 通常优先放在单机内？',
        answer: 'TP 的层内集合通信出现在生成每个 token 的关键路径上。把 TP 放在具备高速互联的节点内，通常比跨节点更容易压低 decode 延迟。',
      },
      {
        question: 'MoE 的 Expert Parallelism 主要卡在哪里？',
        answer: 'token 要发往专家所在的 rank，计算完再收回，常用 all-to-all 完成。重点看跨卡通信和专家负载不均，最忙的 rank 会拖慢整步。',
      },
    ],
    sources: [
      { label: 'Megatron Core 并行策略', url: 'https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html' },
      { label: 'Megatron Core MoE', url: 'https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/features/moe.html' },
    ],
  },
  {
    id: 'example-kernels',
    company: '通用示例',
    round: '主题练习',
    title: 'Attention 算子与显存管理',
    example: true,
    tags: ['算子', 'KV Cache'],
    questions: [
      {
        question: 'FlashAttention 的主要优化是什么？',
        answer: '分块计算 QKᵀ，并用在线 softmax 合并每块的结果，避免将完整的注意力矩阵写入 HBM。主要节省显存读写，标准全注意力的算术复杂度仍是 O(n²)。',
      },
      {
        question: 'PagedAttention 为什么能提高服务吞吐？',
        answer: '它用块表把逻辑 KV 块映射到不连续的物理块，按需分配并支持共享。显存浪费少了，同一张卡通常能承载更多并发请求。',
      },
      {
        question: '普通 Transformer 的 KV Cache 单 token 显存怎么算？',
        answer: '全模型每 token 约占 2 × 层数 × KV head 数 × head 维度 × 每元素字节数，2 对应 K 和 V。估算单卡时，还要考虑 KV head 的分片或复制，以及实际分配的块数。',
      },
    ],
    sources: [
      { label: 'FlashAttention 论文', url: 'https://arxiv.org/abs/2205.14135' },
      { label: 'PagedAttention 论文', url: 'https://arxiv.org/abs/2309.06180' },
    ],
  },
  {
    id: 'example-scheduling',
    company: '通用示例',
    round: '主题练习',
    title: '请求调度与延迟指标',
    example: true,
    tags: ['请求调度', '性能指标'],
    questions: [
      {
        question: 'Continuous batching 跟静态 batching 的主要区别是什么？',
        answer: '以推理迭代为单位重新组 batch。完成的请求立即退出，有资源时新请求可加入，减少等待长请求结束造成的空闲。',
      },
      {
        question: 'Chunked prefill 解决什么问题？',
        answer: '把长 prefill 切成小块，与 decode 按 token budget 混批，降低单次长 prefill 对流式输出的阻塞。块大小会影响 TTFT、ITL 和吞吐之间的取舍。',
      },
      {
        question: 'TTFT、ITL 和吞吐各看什么？',
        answer: 'TTFT 是请求到首 token 的时间，ITL 是流式输出中相邻 token 的间隔。吞吐看单位时间处理的请求数或生成的 token 数，压测时要固定口径和请求分布。',
      },
    ],
    sources: [
      { label: 'vLLM 调度与性能调优', url: 'https://docs.vllm.ai/en/stable/configuration/optimization/' },
      { label: 'Sarathi-Serve 论文', url: 'https://arxiv.org/abs/2403.02310' },
    ],
  },
];

# HydroOJ 动态数据评测插件 (Dynamic Data Judge)

该插件为 HydroJudge 添加了一种新的题目类型，允许在评测过程中动态生成测试点的输入和答案。生成的文件将作为沙箱缓存文件保存，并在测试点评测结束后销毁；这些文件不会被上传到题目的测试数据（testdata）目录中。

## 架构

- Hydro 服务器仍通过 `RecordModel.judge` 创建常规评测任务。
- 插件通过扩展 `@hydrooj/hydrojudge/src/judge` 注册了一个新的 HydroJudge `config.type`，默认类型名为 `dynamic_generator`。
- HydroJudge 会为每个评测任务编译一次用户提交的代码、生成器 `gen.*`、标准程序 `std.*` 以及 checker。
- 对于每一个测试点，HydroJudge 按以下顺序运行：
  1. 运行生成器 -> 产生临时输入文件
  2. 使用该输入运行标准程序 -> 产生临时答案文件
  3. 使用相同的输入运行用户提交 -> 产生临时用户输出文件
  4. 使用 Checker 对比用户输出与临时答案
- 生成器（Generator）和标准程序（Standard Solution）的失败将被报告为 **系统错误 (System Error)**，因为这属于评测机或题目数据故障，而非选手的错误。

## 文件结构

```text
hydrooj-dynamic-data-judge/
  package.json
  tsconfig.json
  index.ts
  README.md
  examples/
    config.yaml
    gen.cpp
    std.cpp
```

## 安装

```bash
cd /root/.hydro/addons
git clone https://github.com/ganyvze/hydrooj-djudge
cd hydrooj-djudge
npm install
hydrooj addon add /root/.hydro/addons/hydrooj-djudge
pm2 restart hydrooj
```

请在插件目录中安装开发依赖。Hydro 会直接加载 TypeScript 插件，本地的 `hydrooj` 包提供了 `index.ts` 中使用的运行时导入和类型声明。

对于独立运行的 HydroJudge 守护进程（Daemon），请在同样的 Hydro 环境中安装此插件并重启评测进程。未加载该插件的评测机将因无法识别 `type: dynamic_generator` 而拒绝评测任务。

## 题目数据布局

只需将动态评测源码和 `config.yaml` 上传到题目的测试数据（testdata）包中：

```text
gen.cpp
std.cpp
config.yaml
```

最小化 `config.yaml` 示例：

```yaml
type: dynamic_generator
time: 1s
memory: 256m
checker_type: default

dynamic:
  generator: gen.cpp
  standard: std.cpp
  count: 100
  seedBase: 20260614
  generatorArgs: ["{index}", "{seed}"]
  stdArgs: ["{index}"]
  generatorTime: 2s
  generatorMemory: 256m
  standardTime: 5s
  standardMemory: 512m
```

包含显式子任务（Subtasks）和逐测试点种子的示例：

```yaml
type: dynamic_generator
time: 2s
memory: 512m
checker_type: testlib
checker: chk.cpp

dynamic:
  generator: { file: gen.cpp, lang: cc }
  standard: { file: std.cpp, lang: cc }
  generatorArgs: ["{subtask}", "{id}", "{seed}"]

subtasks:
  - id: 1
    type: sum
    score: 30
    cases:
      - id: 1
        seed: 101
        score: 10
      - id: 2
        seed: 102
        score: 20
  - id: 2
    type: min
    score: 70
    cases:
      - id: 1
        seed: 201
      - id: 2
        seed: 202
```

### 可用的参数占位符：

- `{index}`：全局测试点索引，从 1 开始
- `{id}` 或 `{case}`：子任务内部的测试点 ID
- `{subtask}`：子任务 ID
- `{seed}`：配置的种子或 `seedBase + index - 1`
- `{rid}`：Hydro 评测记录 ID

上述数值也会通过环境变量暴露给程序：`HYDRO_DYNAMIC_INDEX`, `HYDRO_DYNAMIC_SEED`, `HYDRO_TESTCASE`, 以及 `HYDRO_SUBTASK`。

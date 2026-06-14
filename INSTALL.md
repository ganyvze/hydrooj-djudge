# HydroOJ 动态数据评测插件 - 详细安装指南

本文档提供 `hydrooj-dynamic-data-judge` 插件的完整安装和配置说明。

## 目录

- [前置要求](#前置要求)
- [安装步骤](#安装步骤)
- [验证安装](#验证安装)
- [题目配置](#题目配置)
- [高级配置](#高级配置)
- [故障排查](#故障排查)
- [已知问题](#已知问题)

---

## 前置要求

### 系统要求

- **操作系统**: Linux (推荐 Ubuntu 20.04+) 或其他支持 HydroOJ 的系统
- **Node.js**: >= 18.x (推荐 20.x LTS)
- **npm**: >= 8.x
- **Git**: 任意现代版本

### 软件依赖

在安装本插件之前，确保已正确安装并运行以下软件：

1. **HydroOJ** (>= 5.0.0)
   - HydroOJ 是在线评测系统的核心
   - 确保 HydroOJ 服务正在运行

2. **HydroJudge** (>= 4.0.0)
   - HydroJudge 是评测机守护进程
   - 可以与 HydroOJ 在同一台机器上运行，也可以分布式部署

3. **pm2** (推荐)
   - 用于管理 HydroOJ 和 HydroJudge 进程
   - 安装命令: `npm install -g pm2`

### 验证前置软件

```bash
# 检查 Node.js 版本
node --version  # 应输出 v18.x.x 或更高

# 检查 npm 版本
npm --version   # 应输出 8.x.x 或更高

# 检查 HydroOJ 状态
pm2 list        # 应看到 hydrooj 进程在运行

# 检查 HydroJudge 状态
pm2 list        # 应看到 hydrojudge 进程在运行（如果是分布式部署）
```

---

## 安装步骤

### 步骤 1: 进入插件目录

HydroOJ 的插件（addons）通常存放在 `~/.hydro/addons/` 目录下：

```bash
# 创建插件目录（如果不存在）
mkdir -p ~/.hydro/addons

# 进入插件目录
cd ~/.hydro/addons
```

**注意**: 
- 在 Linux 系统中，`~` 代表当前用户的主目录（通常是 `/root` 或 `/home/hydrooj`）
- 如果使用 root 用户运行 HydroOJ，路径为 `/root/.hydro/addons/`
- 如果使用专用用户（如 `hydrooj`），路径为 `/home/hydrooj/.hydro/addons/`

### 步骤 2: 获取插件代码

#### 方式一：从 Git 仓库克隆（推荐）

```bash
# 克隆插件仓库
git clone <插件仓库地址> dynamic-data-judge

# 进入插件目录
cd dynamic-data-judge
```

#### 方式二：手动下载

如果无法使用 Git，可以手动下载插件代码：

```bash
# 下载并解压插件代码到 ~/.hydro/addons/dynamic-data-judge/
# 确保目录结构如下：
# ~/.hydro/addons/dynamic-data-judge/
#   ├── package.json
#   ├── tsconfig.json
#   ├── index.ts
#   ├── README.md
#   └── examples/
#       ├── config.yaml
#       ├── gen.cpp
#       └── std.cpp
```

### 步骤 3: 安装依赖

```bash
# 在插件目录中安装依赖
npm install
```

**说明**:
- 本插件需要安装**开发依赖**（devDependencies），因为 HydroOJ 会直接加载 TypeScript 源文件
- `npm install` 会自动安装以下依赖：
  - `hydrooj` (>= 5.0.0): 提供类型定义和运行时 API
  - `@hydrooj/hydrojudge` (>= 4.0.0): 提供评测相关的接口和工具函数
  - `@hydrooj/common`: 提供通用类型定义
  - `typescript`: TypeScript 编译器
  - `@types/node`: Node.js 类型定义

**验证依赖安装**:

```bash
# 检查 node_modules 是否存在
ls node_modules/

# 检查关键依赖是否安装
ls node_modules/hydrooj/
ls node_modules/@hydrooj/hydrojudge/
```

### 步骤 4: 注册插件到 HydroOJ

使用 HydroOJ 的命令行工具注册插件：

```bash
# 注册插件（使用绝对路径）
hydrooj addon add ~/.hydro/addons/dynamic-data-judge

# 或者如果使用 root 用户
hydrooj addon add /root/.hydro/addons/dynamic-data-judge
```

**说明**:
- 此命令会将插件路径添加到 HydroOJ 的配置文件中
- 配置文件通常位于 `~/.hydro/config.json`
- 注册后，HydroOJ 会在启动时自动加载该插件

### 步骤 5: 重启服务

```bash
# 重启 HydroOJ 服务
pm2 restart hydrooj

# 如果 HydroJudge 在另一台机器上运行，也需要重启
pm2 restart hydrojudge
```

**注意**: 
- **所有参与评测的 HydroJudge 实例都必须安装此插件**
- 如果某个评测机没有安装插件，当遇到 `type: dynamic_generator` 的题目时会报错并拒绝评测

### 步骤 6: 验证插件加载

```bash
# 查看 HydroOJ 日志，确认插件已加载
pm2 logs hydrooj --lines 50

# 应该看到类似以下的日志：
# [dynamic-data-judge] registered judge type dynamic_generator
# [dynamic-data-judge] dynamic data judge ready; use type: dynamic_generator in problem config.yaml
```

---

## 验证安装

### 测试 1: 检查插件状态

```bash
# 列出已安装的插件
hydrooj addon list

# 应该看到 dynamic-data-judge 在列表中
```

### 测试 2: 创建测试题目

1. 在 HydroOJ 中创建一道新题目
2. 上传以下测试数据文件：

**gen.cpp** (数据生成器):
```cpp
#include <bits/stdc++.h>
using namespace std;

int main(int argc, char** argv) {
    long long index = argc > 1 ? atoll(argv[1]) : 1;
    long long seed = argc > 2 ? atoll(argv[2]) : index;
    mt19937_64 rng(seed);
    long long a = (long long)(rng() % 1000000) + index;
    long long b = (long long)(rng() % 1000000) + seed % 1000;
    cout << a << ' ' << b << '\n';
    return 0;
}
```

**std.cpp** (标准程序):
```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    long long a, b;
    if (!(cin >> a >> b)) return 0;
    cout << a + b << '\n';
    return 0;
}
```

**config.yaml** (题目配置):
```yaml
type: dynamic_generator
time: 1s
memory: 256m
checker_type: default

dynamic:
  generator: gen.cpp
  standard: std.cpp
  count: 10
  seedBase: 20260614
  generatorArgs: ["{index}", "{seed}"]
  stdArgs: ["{index}"]
  generatorTime: 2s
  generatorMemory: 256m
  standardTime: 2s
  standardMemory: 256m
```

3. 提交一个正确的解决方案（A + B 问题）
4. 观察评测结果

**预期结果**:
- 评测应该正常进行
- 生成 10 个测试点
- 每个测试点使用不同的种子生成数据
- 如果解决方案正确，应该获得满分

### 测试 3: 检查评测日志

```bash
# 查看评测机日志
pm2 logs hydrojudge --lines 100

# 应该看到动态评测相关的日志：
# dynamic.generator[1]<rid> ...
# dynamic.std[1]<rid> ...
# dynamic.user[1]<rid> ...
```

---

## 题目配置

### 基本配置结构

题目的 `config.yaml` 必须包含以下字段：

```yaml
# 必填：指定题目类型为 dynamic_generator
type: dynamic_generator

# 必填：用户程序的时限（支持 ms, s 单位）
time: 1s

# 必填：用户程序的内存限制（支持 m, g 单位）
memory: 256m

# 可选：checker 类型（default, testlib, 等）
checker_type: default

# 可选：自定义 checker（如果使用 testlib 等）
# checker: chk.cpp

# 必填：动态评测配置
dynamic:
  # 必填：数据生成器源文件
  generator: gen.cpp
  
  # 必填：标准程序源文件
  standard: std.cpp
  
  # 必填（二选一）：生成的测试点数量，或定义 subtasks
  count: 10
  
  # 可选：种子基数（默认 1）
  seedBase: 20260614
  
  # 可选：生成器参数（默认 ["{index}", "{seed}"]）
  generatorArgs: ["{index}", "{seed}"]
  
  # 可选：标准程序参数（默认 ["{index}"]）
  stdArgs: ["{index}"]
  
  # 可选：生成器时限（默认 2s）
  generatorTime: 2s
  
  # 可选：生成器内存限制（默认 256m）
  generatorMemory: 256m
  
  # 可选：标准程序时限（默认 5s）
  standardTime: 5s
  
  # 可选：标准程序内存限制（默认 512m）
  standardMemory: 512m
```

### 参数占位符

在 `generatorArgs` 和 `stdArgs` 中可以使用以下占位符：

| 占位符 | 说明 | 示例 |
|--------|------|------|
| `{index}` | 全局测试点索引（从 1 开始） | 1, 2, 3, ... |
| `{id}` 或 `{case}` | 子任务内部的测试点 ID | 1, 2, 3, ... |
| `{subtask}` | 子任务 ID | 1, 2, 3, ... |
| `{seed}` | 种子值 | 20260614, 20260615, ... |
| `{rid}` | Hydro 评测记录 ID | 12345 |

**种子计算规则**:
- 如果测试点配置了 `seed` 字段，使用该值
- 否则，如果 `seedBase` 是数字，种子 = `seedBase + index - 1`
- 否则，种子 = `{seedBase}{index}`（字符串拼接）

### 环境变量

程序运行时，以下环境变量会被设置：

| 环境变量 | 说明 |
|----------|------|
| `HYDRO_DYNAMIC_INDEX` | 全局测试点索引 |
| `HYDRO_DYNAMIC_SEED` | 种子值 |
| `HYDRO_TESTCASE` | 测试点 ID |
| `HYDRO_SUBTASK` | 子任务 ID |
| `HYDRO_DYNAMIC_ROLE` | 角色标识（generator/standard） |

### 高级配置：使用 Subtasks

如果需要更精细的控制（如不同的子任务使用不同的种子），可以使用 `subtasks` 配置：

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

**说明**:
- 使用 `subtasks` 时，不需要设置 `dynamic.count`
- 每个 case 可以单独指定 `seed`
- 子任务的评分规则与普通题目相同

---

## 高级配置

### 插件全局配置

可以在 HydroOJ 的系统配置中修改插件的默认行为：

```bash
# 编辑 HydroOJ 配置
hydrooj config edit
```

在配置文件中添加：

```json
{
  "plugins": {
    "dynamic-data-judge": {
      "typeName": "dynamic_generator",
      "maxCases": 1000,
      "generatorTime": "2s",
      "generatorMemory": "256m",
      "standardTime": "5s",
      "standardMemory": "512m"
    }
  }
}
```

**配置项说明**:

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `typeName` | `dynamic_generator` | 题目配置中使用的类型名称 |
| `maxCases` | `1000` | 单个评测任务允许的最大测试点数量 |
| `generatorTime` | `2s` | 生成器的默认时限 |
| `generatorMemory` | `256m` | 生成器的默认内存限制 |
| `standardTime` | `5s` | 标准程序的默认时限 |
| `standardMemory` | `512m` | 标准程序的默认内存限制 |

### 自定义 Checker

如果使用自定义 checker（如 testlib），需要在题目配置中指定：

```yaml
type: dynamic_generator
time: 1s
memory: 256m
checker_type: testlib
checker: chk.cpp

dynamic:
  generator: gen.cpp
  standard: std.cpp
  count: 10
```

**chk.cpp** 示例（testlib 格式）:
```cpp
#include "testlib.h"

int main(int argc, char* argv[]) {
    setName("compare two integers");
    registerTestlibCmd(argc, argv);
    
    int expected = ans.readInt();
    int actual = ouf.readInt();
    
    if (expected == actual)
        quitf(_ok, "Correct answer");
    else
        quitf(_wa, "Expected %d, found %d", expected, actual);
}
```

### 多语言支持

生成器和标准程序可以使用不同的编程语言：

```yaml
dynamic:
  generator: { file: gen.py, lang: py }
  standard: { file: std.cpp, lang: cc }
```

支持的语言取决于 HydroJudge 的配置，常见的有：
- `cc`: C++
- `c`: C
- `py`: Python 3
- `java`: Java
- `pas`: Pascal

---

## 故障排查

### 问题 1: 插件未加载

**症状**: 
- 日志中没有 `registered judge type dynamic_generator` 的消息
- 提交评测时报错 "Unknown judge type"

**排查步骤**:

```bash
# 1. 检查插件是否正确注册
hydrooj addon list

# 2. 检查插件目录结构
ls ~/.hydro/addons/dynamic-data-judge/

# 3. 检查依赖是否安装
ls ~/.hydro/addons/dynamic-data-judge/node_modules/

# 4. 查看完整日志
pm2 logs hydrooj --lines 200

# 5. 尝试手动重启
pm2 restart hydrooj
```

**解决方案**:
- 确保 `npm install` 成功执行
- 确保 `hydrooj addon add` 命令执行成功
- 检查 Node.js 版本是否符合要求

### 问题 2: 评测机报错 "Unknown judge type"

**症状**:
- 提交后评测状态显示 "System Error"
- 日志显示 "Unknown judge type: dynamic_generator"

**原因**:
- 评测机（HydroJudge）没有安装此插件

**解决方案**:
```bash
# 在评测机所在的服务器上安装插件
cd ~/.hydro/addons/
git clone <插件仓库地址> dynamic-data-judge
cd dynamic-data-judge
npm install
hydrooj addon add ~/.hydro/addons/dynamic-data-judge
pm2 restart hydrojudge
```

**注意**: 
- 如果 HydroOJ 和 HydroJudge 在不同机器上，**两台机器都需要安装插件**
- 如果有多个评测机，**所有评测机都需要安装插件**

### 问题 3: 生成器或标准程序编译失败

**症状**:
- 评测状态显示 "System Error"
- 日志显示 "Generator compile failed" 或 "Standard solution compile failed"

**排查步骤**:

```bash
# 1. 检查源文件是否存在于题目的 testdata 中
# 在 HydroOJ 题目管理页面查看测试数据

# 2. 检查源文件语法
# 在本地编译测试：
g++ -o gen gen.cpp
g++ -o std std.cpp
```

**解决方案**:
- 确保 `gen.cpp` 和 `std.cpp` 已上传到题目的测试数据中
- 确保源文件语法正确，可以在本地编译通过
- 检查 `config.yaml` 中的文件名是否正确

### 问题 4: 测试点数量错误

**症状**:
- 日志显示 "Too many dynamic testcases. Cancelled."

**原因**:
- `dynamic.count` 超过了插件配置的 `maxCases`（默认 1000）

**解决方案**:

```bash
# 方法 1: 减少测试点数量
# 在 config.yaml 中修改：
dynamic:
  count: 100  # 减少到合理数量

# 方法 2: 增加插件的 maxCases 限制
hydrooj config edit
# 修改 plugins.dynamic-data-judge.maxCases
```

### 问题 5: 生成器或标准程序运行超时

**症状**:
- 评测状态显示 "System Error"
- 日志显示 "Generator failed" 或 "Standard solution failed"

**解决方案**:

```yaml
# 在 config.yaml 中增加时限
dynamic:
  generatorTime: 5s    # 增加生成器时限
  generatorMemory: 512m  # 增加内存限制
  standardTime: 10s    # 增加标准程序时限
  standardMemory: 1g   # 增加内存限制
```

### 问题 6: TypeScript 编译错误

**症状**:
- 插件加载失败
- 日志显示 TypeScript 编译错误

**排查步骤**:

```bash
# 进入插件目录
cd ~/.hydro/addons/dynamic-data-judge

# 运行类型检查
npm run typecheck
```

**解决方案**:
- 确保所有依赖已正确安装
- 检查 Node.js 版本是否符合要求
- 如果依赖版本有冲突，尝试删除 `node_modules` 并重新安装：
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```

---

## 已知问题

### 1. 全局变量依赖

插件代码中使用了全局变量 `(global as any).addons?.hydrojudge` 来定位 HydroJudge 模块路径。在某些特殊部署场景下（如自定义 HydroJudge 安装路径），这个全局变量可能未正确设置，导致模块加载失败。

**影响**: 插件可能无法正确加载 HydroJudge 的内部模块

**临时解决方案**: 
- 确保使用标准的 HydroOJ 安装方式
- 如果遇到问题，检查 HydroJudge 是否正确注册到全局 `addons` 对象

### 2. 运行时类型假设

代码中假设 `ctx.session.getLang(ctx.lang)` 返回的对象包含 `address_space_limit` 和 `process_limit` 属性。如果 HydroJudge 的 API 发生变化，可能导致运行时错误。

**影响**: 在评测用户程序时可能出现 undefined 属性访问

**临时解决方案**:
- 确保 HydroJudge 版本与插件兼容（>= 4.0.0）
- 如果遇到问题，检查 HydroJudge 的版本更新日志

### 3. 动态 require 的兼容性

插件使用动态 `require()` 加载 HydroJudge 的内部模块。在某些模块系统配置下（如 ES Modules），可能会有兼容性问题。

**影响**: 在特定 Node.js 配置下可能无法加载模块

**临时解决方案**:
- 确保使用 CommonJS 模块系统（HydroOJ 默认配置）
- 不要在 `package.json` 中设置 `"type": "module"`

### 4. 多轮评测的限制

插件不支持 `multi_pass` 配置。如果题目配置了 `multi_pass: true`，插件会抛出 FormatError。

**影响**: 无法用于需要多轮交互的题目

**临时解决方案**:
- 不要在动态评测题目中使用 `multi_pass` 配置

---

## 附录

### 完整安装脚本

以下是一个完整的自动化安装脚本（适用于 Linux 系统）：

```bash
#!/bin/bash
set -e

echo "=== HydroOJ 动态数据评测插件安装脚本 ==="

# 配置变量
PLUGIN_NAME="dynamic-data-judge"
PLUGIN_DIR="$HOME/.hydro/addons/$PLUGIN_NAME"
REPO_URL="<插件仓库地址>"  # 请替换为实际的仓库地址

# 1. 检查前置条件
echo "[1/6] 检查前置条件..."
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "错误: npm 未安装"
    exit 1
fi

if ! command -v hydrooj &> /dev/null; then
    echo "错误: HydroOJ 未安装"
    exit 1
fi

echo "Node.js 版本: $(node --version)"
echo "npm 版本: $(npm --version)"

# 2. 创建插件目录
echo "[2/6] 创建插件目录..."
mkdir -p "$HOME/.hydro/addons"

# 3. 克隆插件代码
echo "[3/6] 克隆插件代码..."
if [ -d "$PLUGIN_DIR" ]; then
    echo "插件目录已存在，更新代码..."
    cd "$PLUGIN_DIR"
    git pull
else
    git clone "$REPO_URL" "$PLUGIN_DIR"
fi

# 4. 安装依赖
echo "[4/6] 安装依赖..."
cd "$PLUGIN_DIR"
npm install

# 5. 注册插件
echo "[5/6] 注册插件..."
hydrooj addon add "$PLUGIN_DIR" || echo "插件可能已注册，跳过"

# 6. 重启服务
echo "[6/6] 重启服务..."
pm2 restart hydrooj
pm2 restart hydrojudge 2>/dev/null || echo "如果 HydroJudge 在远程机器上，请手动重启"

echo ""
echo "=== 安装完成 ==="
echo "请检查日志确认插件已加载: pm2 logs hydrooj --lines 50"
echo "日志中应该包含: registered judge type dynamic_generator"
```

**使用方法**:
```bash
chmod +x install.sh
./install.sh
```

### 卸载插件

```bash
# 1. 从 HydroOJ 中移除插件
hydrooj addon remove dynamic-data-judge

# 2. 删除插件文件
rm -rf ~/.hydro/addons/dynamic-data-judge

# 3. 重启服务
pm2 restart hydrooj
pm2 restart hydrojudge
```

### 更新插件

```bash
# 1. 进入插件目录
cd ~/.hydro/addons/dynamic-data-judge

# 2. 拉取最新代码
git pull

# 3. 更新依赖
npm install

# 4. 重启服务
pm2 restart hydrooj
pm2 restart hydrojudge
```

---

## 技术支持

如果遇到问题：

1. 查看 HydroOJ 日志: `pm2 logs hydrooj`
2. 查看 HydroJudge 日志: `pm2 logs hydrojudge`
3. 检查 [README.md](README.md) 中的基本说明
4. 参考 examples/ 目录中的示例配置

---

**文档版本**: 1.0  
**最后更新**: 2026-06-14  
**适用插件版本**: 0.1.0

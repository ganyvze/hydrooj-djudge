import path from 'path';
import type {
    CompilableSource, JudgeResultBody, NormalizedCase, NormalizedSubtask,
} from '@hydrooj/common';
import {
    Context, Logger, Schema, STATUS,
} from 'hydrooj';

import type { Execute } from '@hydrooj/hydrojudge/src/interface';
import type { Context as JudgeContext, ContextSubTask } from '@hydrooj/hydrojudge/src/judge/interface';
import type { CopyInFile } from '@hydrooj/hydrojudge/src/sandbox';

type JudgeRegistry = Record<string, { judge(ctx: JudgeContext): Promise<void> }>;
type HydroJudgeRuntime = {
    checkers: typeof import('@hydrooj/hydrojudge/src/checkers').default;
    CompileError: typeof import('@hydrooj/hydrojudge/src/error').CompileError;
    FormatError: typeof import('@hydrooj/hydrojudge/src/error').FormatError;
    SystemError: typeof import('@hydrooj/hydrojudge/src/error').SystemError;
    runFlow: typeof import('@hydrooj/hydrojudge/src/flow').runFlow;
    runQueued: typeof import('@hydrooj/hydrojudge/src/sandbox').runQueued;
    compilerText: typeof import('@hydrooj/hydrojudge/src/utils').compilerText;
    parseMemoryMB: typeof import('@hydrooj/hydrojudge/src/utils').parseMemoryMB;
    parseTimeMS: typeof import('@hydrooj/hydrojudge/src/utils').parseTimeMS;
};

interface DynamicCase extends NormalizedCase {
    dynamicIndex?: number;
    generatorArgs?: Array<string | number> | string;
    stdArgs?: Array<string | number> | string;
    args?: Array<string | number> | string;
    seed?: string | number;
    stdin?: string;
}

interface DynamicSubtask extends NormalizedSubtask {
    cases: DynamicCase[];
}

interface DynamicProblemConfig {
    generator?: CompilableSource;
    gen?: CompilableSource;
    std?: CompilableSource;
    standard?: CompilableSource;
    count?: number;
    seedBase?: number | string;
    generatorArgs?: Array<string | number> | string;
    stdArgs?: Array<string | number> | string;
    generatorTime?: string;
    generatorMemory?: string;
    standardTime?: string;
    standardMemory?: string;
    processLimit?: number;
}

interface ResolvedDynamicConfig {
    generator: CompilableSource;
    standard: CompilableSource;
    count: number;
    seedBase: number | string;
    generatorArgs: Array<string | number> | string;
    stdArgs: Array<string | number> | string;
    generatorTime: number;
    generatorMemory: number;
    standardTime: number;
    standardMemory: number;
    processLimit?: number;
}

interface SandboxRunResult {
    status: number;
    code: number;
    signalled: boolean;
    time: number;
    memory: number;
    fileIds?: Record<string, string>;
    stdout?: string;
    stderr?: string;
    [Symbol.asyncDispose]?: () => Promise<unknown>;
}

export const name = 'dynamic-data-judge';

export const Config = Schema.object({
    typeName: Schema.string().default('dynamic_generator').description('Problem config type handled by this plugin.'),
    maxCases: Schema.number().default(1000).description('Maximum dynamic testcase count per judge task.'),
    generatorTime: Schema.string().default('2s').description('Default generator time limit.'),
    generatorMemory: Schema.string().default('256m').description('Default generator memory limit.'),
    standardTime: Schema.string().default('5s').description('Default standard solution time limit.'),
    standardMemory: Schema.string().default('512m').description('Default standard solution memory limit.'),
});

let pluginConfig: ReturnType<typeof Config> = {
    typeName: 'dynamic_generator',
    maxCases: 1000,
    generatorTime: '2s',
    generatorMemory: '256m',
    standardTime: '5s',
    standardMemory: '512m',
};
const logger = new Logger('dynamic-data-judge');
let hydroJudge: HydroJudgeRuntime;

function requireHydroJudgeModule<T>(subpath: string): T {
    const addonRoot = (global as any).addons?.hydrojudge;
    if (addonRoot) return require(path.join(addonRoot, subpath));
    return require(`@hydrooj/hydrojudge/${subpath}`);
}

function loadHydroJudgeRuntime() {
    const checkersModule = requireHydroJudgeModule<any>('src/checkers');
    const error = requireHydroJudgeModule<typeof import('@hydrooj/hydrojudge/src/error')>('src/error');
    const flow = requireHydroJudgeModule<typeof import('@hydrooj/hydrojudge/src/flow')>('src/flow');
    const sandbox = requireHydroJudgeModule<typeof import('@hydrooj/hydrojudge/src/sandbox')>('src/sandbox');
    const utils = requireHydroJudgeModule<typeof import('@hydrooj/hydrojudge/src/utils')>('src/utils');
    hydroJudge = {
        checkers: checkersModule.default || checkersModule,
        CompileError: error.CompileError,
        FormatError: error.FormatError,
        SystemError: error.SystemError,
        runFlow: flow.runFlow,
        runQueued: sandbox.runQueued,
        compilerText: utils.compilerText,
        parseMemoryMB: utils.parseMemoryMB,
        parseTimeMS: utils.parseTimeMS,
    };
}

function statusName(status: number) {
    const names: Record<number, string> = {
        [STATUS.STATUS_ACCEPTED]: 'Accepted',
        [STATUS.STATUS_WRONG_ANSWER]: 'Wrong Answer',
        [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'Time Limit Exceeded',
        [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: 'Memory Limit Exceeded',
        [STATUS.STATUS_RUNTIME_ERROR]: 'Runtime Error',
        [STATUS.STATUS_SYSTEM_ERROR]: 'System Error',
        [STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED]: 'Output Limit Exceeded',
    };
    return names[status] || `Status ${status}`;
}

function shellEscape(value: string) {
    if (value === '') return "''";
    if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

function sourceName(source: CompilableSource) {
    return typeof source === 'string' ? source : `${source.file}#${source.lang}`;
}

function toArgList(args: Array<string | number> | string | undefined) {
    if (args === undefined || args === null) return [];
    return Array.isArray(args) ? args : [args];
}

function renderArgs(
    args: Array<string | number> | string | undefined,
    tokens: Record<string, string>,
) {
    return toArgList(args).map((raw) => String(raw).replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => tokens[key] ?? ''));
}

function appendArgs(execute: string, args: string[]) {
    if (!args.length) return execute;
    return `${execute} ${args.map(shellEscape).join(' ')}`;
}

function disposeResult(result?: SandboxRunResult) {
    return result?.[Symbol.asyncDispose]?.().catch(() => null);
}

function stderrSnippet(result: SandboxRunResult) {
    return (result.stderr || '').trim().substring(0, 4096);
}

function runMessage(label: string, result: SandboxRunResult) {
    const lines = [`${label}: ${statusName(result.status)}`];
    if (result.code) lines.push(`Exit code: ${result.code}`);
    const stderr = stderrSnippet(result);
    if (stderr) lines.push(stderr);
    return lines.join('\n').substring(0, 102400);
}

function outputFile(result: SandboxRunResult): CopyInFile {
    if (result.fileIds?.stdout) return { fileId: result.fileIds.stdout };
    return { content: result.stdout || '' };
}

function readDynamicConfig(ctx: JudgeContext): ResolvedDynamicConfig {
    const raw = (ctx.config as any).dynamic as DynamicProblemConfig || {};
    const generator = raw.generator || raw.gen || (ctx.config as any).generator || (ctx.config as any).gen || 'gen.cpp';
    const standard = raw.standard || raw.std || (ctx.config as any).standard || (ctx.config as any).std || 'std.cpp';
    const count = Number(raw.count || (ctx.config as any).dynamic_count || 0);
    return {
        generator,
        standard,
        count,
        seedBase: raw.seedBase ?? 1,
        generatorArgs: raw.generatorArgs ?? ['{index}', '{seed}'],
        stdArgs: raw.stdArgs ?? ['{index}'],
        generatorTime: hydroJudge.parseTimeMS(raw.generatorTime || pluginConfig.generatorTime),
        generatorMemory: hydroJudge.parseMemoryMB(raw.generatorMemory || pluginConfig.generatorMemory),
        standardTime: hydroJudge.parseTimeMS(raw.standardTime || pluginConfig.standardTime),
        standardMemory: hydroJudge.parseMemoryMB(raw.standardMemory || pluginConfig.standardMemory),
        processLimit: raw.processLimit,
    };
}

function caseScore(index: number, count: number) {
    const base = Math.floor(10000 / count);
    const extra = 10000 - base * count;
    return (base + (index < extra ? 1 : 0)) / 100;
}

function buildGeneratedSubtasks(ctx: JudgeContext, dynamic: ResolvedDynamicConfig) {
    const existing = (ctx.config.subtasks || []) as DynamicSubtask[];
    let serial = 1;
    if (existing.some((subtask) => subtask.cases?.length)) {
        for (const subtask of existing) {
            for (const c of subtask.cases || []) c.dynamicIndex ||= serial++;
        }
        ctx.config.count = serial - 1;
        if (ctx.config.count > pluginConfig.maxCases) {
            throw new hydroJudge.FormatError('Too many dynamic testcases. Cancelled.');
        }
        return;
    }

    if (!Number.isSafeInteger(dynamic.count) || dynamic.count <= 0) {
        throw new hydroJudge.FormatError('Dynamic generator requires dynamic.count or explicit subtasks.');
    }
    if (dynamic.count > pluginConfig.maxCases) {
        throw new hydroJudge.FormatError('Too many dynamic testcases. Cancelled.');
    }

    const time = Number(ctx.config.time) || hydroJudge.parseTimeMS('1s');
    const memory = Number(ctx.config.memory) || hydroJudge.parseMemoryMB('256m');
    ctx.config.subtasks = [{
        id: 1,
        type: 'sum',
        if: [],
        score: 100,
        time,
        memory,
        cases: Array.from({ length: dynamic.count }, (_, i) => ({
            id: i + 1,
            dynamicIndex: i + 1,
            score: caseScore(i, dynamic.count),
            time,
            memory,
            input: '/dev/null',
            output: '/dev/null',
        })),
    }] as DynamicSubtask[];
    ctx.config.count = dynamic.count;
}

async function compileJudgeProgram(
    ctx: JudgeContext,
    label: string,
    type: 'generator' | 'std',
    source: CompilableSource,
) {
    try {
        return await ctx.compileLocalFile(type, source);
    } catch (e) {
        if (e instanceof hydroJudge.CompileError || (e as any)?.type === 'CompileError') {
            ctx.next({
                compilerText: `[${label}] ${sourceName(source)} compile failed\n${hydroJudge.compilerText((e as any).stdout, (e as any).stderr)}`,
            });
            throw new hydroJudge.SystemError(`${label} compile failed.`);
        }
        throw e;
    }
}

async function ensureJudgeProgramOk(
    ctx: JudgeContext,
    label: string,
    result: SandboxRunResult,
    subtask: ContextSubTask,
    testcase: DynamicCase,
) {
    if (result.status === STATUS.STATUS_ACCEPTED && !result.code) return;
    ctx.next({
        message: `${label} failed on subtask ${subtask.subtask.id}, testcase ${testcase.id}.\n${runMessage(label, result)}`,
    });
    throw new hydroJudge.SystemError(`${label} failed on testcase {0}.`, [String(testcase.dynamicIndex || testcase.id)]);
}

function caseTokens(ctx: JudgeContext, subtask: ContextSubTask, testcase: DynamicCase, dynamic: ResolvedDynamicConfig) {
    const index = testcase.dynamicIndex || testcase.id;
    const seedBase = dynamic.seedBase;
    const seed = testcase.seed ?? (typeof seedBase === 'number' ? seedBase + index - 1 : `${seedBase}${index}`);
    return {
        id: String(testcase.id),
        case: String(testcase.id),
        index: String(index),
        seed: String(seed),
        subtask: String(subtask.subtask.id),
        rid: ctx.rid,
    };
}

function dynamicJudgeCase(
    dynamic: ResolvedDynamicConfig,
    executeGeneratorRef: () => Execute,
    executeStdRef: () => Execute,
    executeUserRef: () => Execute,
    checkerRef: () => Execute,
) {
    return (testcase: DynamicCase) => async (
        ctx: JudgeContext,
        subtask: ContextSubTask,
    ): Promise<JudgeResultBody['case']> => {
        const executeGenerator = executeGeneratorRef();
        const executeStd = executeStdRef();
        const executeUser = executeUserRef();
        const checker = checkerRef();
        const tokens = caseTokens(ctx, subtask, testcase, dynamic);
        const env = {
            ...ctx.env,
            HYDRO_TESTCASE: tokens.id,
            HYDRO_SUBTASK: tokens.subtask,
            HYDRO_DYNAMIC_INDEX: tokens.index,
            HYDRO_DYNAMIC_SEED: tokens.seed,
        };
        const generatorArgs = renderArgs(testcase.generatorArgs ?? testcase.args ?? dynamic.generatorArgs, tokens);
        const stdArgs = renderArgs(testcase.stdArgs ?? dynamic.stdArgs, tokens);

        let generatedInput: SandboxRunResult | undefined;
        let standardOutput: SandboxRunResult | undefined;
        let userOutput: SandboxRunResult | undefined;
        try {
            const checkerType = ctx.config.checker_type || 'default';
            generatedInput = await hydroJudge.runQueued(
                appendArgs(executeGenerator.execute, generatorArgs),
                {
                    stdin: { content: testcase.stdin || '' },
                    copyIn: executeGenerator.copyIn,
                    copyOut: ['stderr'],
                    copyOutCached: ['stdout'],
                    time: dynamic.generatorTime,
                    memory: dynamic.generatorMemory,
                    processLimit: dynamic.processLimit,
                    env: { ...env, HYDRO_DYNAMIC_ROLE: 'generator' },
                },
                `dynamic.generator[${tokens.index}]<${ctx.rid}>`,
                1,
            ) as SandboxRunResult;
            await ensureJudgeProgramOk(ctx, 'Generator', generatedInput, subtask, testcase);
            const input = outputFile(generatedInput);

            standardOutput = await hydroJudge.runQueued(
                appendArgs(executeStd.execute, stdArgs),
                {
                    stdin: input,
                    copyIn: executeStd.copyIn,
                    copyOut: ['stderr'],
                    copyOutCached: ['stdout'],
                    time: dynamic.standardTime,
                    memory: dynamic.standardMemory,
                    processLimit: dynamic.processLimit,
                    env: { ...env, HYDRO_DYNAMIC_ROLE: 'standard' },
                },
                `dynamic.std[${tokens.index}]<${ctx.rid}>`,
                1,
            ) as SandboxRunResult;
            await ensureJudgeProgramOk(ctx, 'Standard solution', standardOutput, subtask, testcase);

            const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);
            userOutput = await hydroJudge.runQueued(
                executeUser.execute,
                {
                    stdin: input,
                    copyIn: executeUser.copyIn,
                    filename: ctx.config.filename,
                    time: testcase.time,
                    memory: testcase.memory,
                    cacheStdoutAndStderr: true,
                    addressSpaceLimit: address_space_limit,
                    processLimit: process_limit,
                    env,
                },
                `dynamic.user[${tokens.index}]<${ctx.rid}>`,
            ) as SandboxRunResult;

            let status = userOutput.status;
            let score = 0;
            let message: any = '';
            if (status === STATUS.STATUS_ACCEPTED) {
                const checked = await hydroJudge.checkers[checkerType]({
                    execute: checker.execute,
                    copyIn: checker.copyIn,
                    code: ctx.code,
                    input,
                    output: outputFile(standardOutput),
                    user_stdout: outputFile(userOutput),
                    user_stderr: userOutput.fileIds?.stderr ? { fileId: userOutput.fileIds.stderr } : { content: userOutput.stderr || '' },
                    score: testcase.score,
                    detail: ctx.config.detail,
                    env: {
                        ...env,
                        HYDRO_TIME_USAGE: userOutput.time.toString(),
                        HYDRO_MEMORY_USAGE: Math.floor(userOutput.memory / 1024).toString(),
                    },
                });
                status = checked.status;
                score = checked.score;
                message = checked.message;
            } else if (ctx.config.detail === 'full') {
                message = runMessage('User program', userOutput);
            }

            return {
                id: testcase.id,
                subtaskId: subtask.subtask.id,
                status,
                score,
                time: userOutput.time,
                memory: userOutput.memory,
                message,
            };
        } finally {
            await Promise.all([
                disposeResult(userOutput),
                disposeResult(standardOutput),
                disposeResult(generatedInput),
            ]);
        }
    };
}

async function judge(ctx: JudgeContext) {
    if (ctx.config.multi_pass) throw new hydroJudge.FormatError('Dynamic generator does not support multi_pass.');
    const dynamic = readDynamicConfig(ctx);
    buildGeneratedSubtasks(ctx, dynamic);

    let executeUser: Execute;
    let checker: Execute;
    let executeGenerator: Execute;
    let executeStd: Execute;

    await hydroJudge.runFlow(ctx, {
        compile: async () => {
            const checkerType = ctx.config.checker_type || 'default';
            [executeUser, checker, executeGenerator, executeStd] = await Promise.all([
                ctx.compile(ctx.lang, ctx.code),
                ctx.compileLocalFile('checker', ctx.config.checker as CompilableSource, checkerType),
                compileJudgeProgram(ctx, 'Generator', 'generator', dynamic.generator),
                compileJudgeProgram(ctx, 'Standard solution', 'std', dynamic.standard),
            ]);
            ctx.execute = executeUser;
            ctx.checker = checker;
        },
        judgeCase: dynamicJudgeCase(
            dynamic,
            () => executeGenerator,
            () => executeStd,
            () => executeUser,
            () => checker,
        ),
    });
}

function registerJudgeType(typeName: string) {
    // HydroJudge exports a mutable CommonJS registry object from src/judge/index.ts.
    // Adding a key here lets task.ts dispatch config.type to this judge without patching Hydro core.
    const registry = requireHydroJudgeModule<JudgeRegistry>('src/judge');
    registry[typeName] = { judge };
    logger.info('registered judge type %s', typeName);
}

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
    pluginConfig = config;
    loadHydroJudgeRuntime();
    registerJudgeType(config.typeName);
    ctx.on('app/ready', () => {
        logger.info('dynamic data judge ready; use type: %s in problem config.yaml', config.typeName);
    });
}

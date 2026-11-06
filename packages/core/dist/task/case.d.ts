import type { TaskRecord, TaskRecordWithPath } from './task-store.d.ts'

/** JSDoc typedef 锚点（copy-domain-dts 子集校验要求手写版覆盖生成版导出面）。 */
export type { TaskRecord }

/** CASE/RESULT 条目（SR 或 C 解析结果：条目 id 与正文）。 */
export type CaseItem = { id: string; body: string }

/** 文档 front-matter 元数据（YAML 解析结果）。 */
export type DocumentMeta = Record<string, unknown>

export type CasePurpose = 'case-design' | 'execution'
export type CasePurposeKey = 'DESIGN' | 'EXECUTION'

export interface TaskCaseRecord {
  required: boolean
  designSession: string | null
}

export interface CaseStructureIssue {
  code: string
  message: string
}

export interface CaseStructureOptions {
  taskRelPath?: string
  children?: string[]
  changedFiles?: string[]
}

export const CASE_STRUCTURE: Readonly<{
  caseSections: readonly string[]
  resultSections: readonly string[]
  srFields: readonly string[]
  cFields: readonly string[]
  coverageFields: readonly string[]
  resultStatuses: readonly string[]
  coverageStatuses: readonly string[]
}>
export const CASE_FILES: Readonly<{
  document: 'case.md'
  result: 'case-result.md'
}>
export const CASE_PURPOSES: Readonly<Record<CasePurposeKey, CasePurpose>>
export const CASE_MISSING: 'case.md is missing'

export function createCaseRecord(
  required: boolean,
  previous?: TaskCaseRecord | null,
): TaskCaseRecord
export function inspectCaseStructure(
  caseContent: string | null,
  prdContent: string,
  options?: CaseStructureOptions,
): CaseStructureIssue[]
export function listCaseChangedFiles(
  root: string,
  task: TaskRecord | TaskRecordWithPath,
): [Error | null, string[] | null]
export function evaluateCaseExecutionGate(
  root: string,
  taskRelPath: string,
  task: TaskRecord | TaskRecordWithPath,
): string[]
export function evaluateCaseOutcomeGate(
  root: string,
  taskRelPath: string,
  task: TaskRecord | TaskRecordWithPath,
  options?: CaseStructureOptions,
): CaseStructureIssue[]


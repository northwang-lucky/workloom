/**
 * developer 身份校验（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - developer 名同时是 workspace/<developer>/ 目录名与署名，字符集收敛为
 *   字母数字 + 点/下划线/连字符；首字符必须字母或数字（防隐藏目录与 CLI 歧义）；
 * - init 写入与 journal 定位共用同一校验，规则单一事实源。
 */

/** developer 名合法模式：首字符字母或数字，后续限 [A-Za-z0-9._-]，总长 1-64。 */
export const DEVELOPER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/**
 * 校验 developer 身份；非法抛错（英文消息，fail loud）。
 * @param {string} developer 开发者标识
 */
export function assertDeveloper(developer) {
  if (typeof developer !== 'string' || !DEVELOPER_PATTERN.test(developer)) {
    throw new Error(
      `workloom identity: invalid developer name ${JSON.stringify(developer)} ` +
        '(must be 1-64 chars, start with a letter or digit, and contain only letters, digits, dot, underscore, or hyphen)',
    )
  }
}

#!/usr/bin/env node

/**
 * 部门配置同步脚本
 *
 * 用法：在项目根目录运行 node scripts/sync-departments.js
 *
 * 功能：将 uniCloud-alipay/shared/departments.js 复制到所有依赖部门配置的云函数目录下
 *
 * 依赖此文件的云函数：
 * - updateUser
 * - createInsider
 * - updateInsider
 * - applyInsider
 * - handleInsiderApplication
 */

const fs = require('fs');
const path = require('path');

const SHARED_FILE = path.join(__dirname, '..', 'uniCloud-alipay', 'shared', 'departments.js');
const CF_ROOT = path.join(__dirname, '..', 'uniCloud-alipay', 'cloudfunctions');

const TARGET_FUNCTIONS = [
  'updateUser',
  'createInsider',
  'updateInsider',
  'applyInsider',
  'handleInsiderApplication',
];

function sync() {
  if (!fs.existsSync(SHARED_FILE)) {
    console.error('[sync-departments] 错误：共享文件不存在: ' + SHARED_FILE);
    process.exit(1);
  }

  if (!fs.existsSync(CF_ROOT)) {
    console.error('[sync-departments] 错误：云函数根目录不存在: ' + CF_ROOT);
    process.exit(1);
  }

  let success = 0;
  let skipped = 0;

  for (const funcName of TARGET_FUNCTIONS) {
    const targetDir = path.join(CF_ROOT, funcName);
    const targetFile = path.join(targetDir, 'departments.js');

    if (!fs.existsSync(targetDir)) {
      console.warn('[sync-departments] 跳过：云函数目录不存在: ' + funcName);
      skipped++;
      continue;
    }

    fs.copyFileSync(SHARED_FILE, targetFile);
    console.log('[sync-departments] 已同步: ' + funcName + '/departments.js');
    success++;
  }

  console.log('');
  console.log('[sync-departments] 完成：同步 ' + success + ' 个，跳过 ' + skipped + ' 个');
  console.log('[sync-departments] 如有改动，请在 HBuilderX 重新部署以上云函数');
}

sync();

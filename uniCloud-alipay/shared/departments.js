'use strict';

/**
 * 部门编码映射表（唯一数据源）
 *
 * 维护方式：
 * 1. 只修改本文件的 DEPARTMENTS 数组
 * 2. 在项目根目录运行 node scripts/sync-departments.js
 * 3. 脚本会自动将本文件分发到所有需要的云函数目录
 * 4. 重新部署相关云函数
 */

const DEPARTMENTS = [
  { code: '300001', name: '高管' },
  { code: '300002', name: '研究部' },
  { code: '300003', name: '固定收益部' },
  { code: '300004', name: '项目投资部' },
  { code: '300006', name: '集中交易室' },
  { code: '300007', name: '产品管理部' },
  { code: '300009', name: '风险管理部' },
  { code: '300010', name: '信用评审部' },
  { code: '300011', name: '法律合规部' },
  { code: '300012', name: '运营管理部' },
  { code: '300013', name: '金融科技部' },
  { code: '300014', name: '资金财务部' },
  { code: '300015', name: '综合管理部' },
  { code: '300016', name: '党委组织部' },
  { code: '300017', name: '审计部' },
  { code: '300018', name: '科技专家' },
  { code: '300019', name: '风险专家' },
  { code: '300022', name: '首席投资官' },
  { code: '300023', name: '多资产配置部' },
  { code: '300025', name: '战略客户部' },
  { code: '300026', name: '渠道拓展部' },
  { code: '300027', name: '纪委办公室' },
];

const DEPARTMENT_NAMES = DEPARTMENTS.map(d => d.name);

function getDepartmentCode(name) {
  const found = DEPARTMENTS.find(d => d.name === name);
  return found ? found.code : '';
}

function isValidDepartment(name) {
  return DEPARTMENT_NAMES.includes(name);
}

module.exports = { DEPARTMENTS, DEPARTMENT_NAMES, getDepartmentCode, isValidDepartment };

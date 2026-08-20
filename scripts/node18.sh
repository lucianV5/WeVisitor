#!/usr/bin/env bash
# 确保使用 Node 18 运行命令，兼容 nvm（brew 安装版）
set -e

# 1. 优先尝试 brew 安装的 nvm
if [ -s "$(brew --prefix nvm 2>/dev/null)/nvm.sh" ]; then
  # shellcheck disable=SC1091
  \. "$(brew --prefix nvm)/nvm.sh"
  nvm use 18 >/dev/null 2>&1 || nvm install 18
# 2. 回退到 ~/.nvm
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  export NVM_DIR="$HOME/.nvm"
  \. "$NVM_DIR/nvm.sh"
  nvm use 18 >/dev/null 2>&1 || nvm install 18
# 3. 回退到 n
elif command -v n >/dev/null 2>&1; then
  n 18 >/dev/null 2>&1 || true
fi

CURRENT_NODE_MAJOR=$(node -v | sed -E 's/v([0-9]+).*/\1/')
if [ "$CURRENT_NODE_MAJOR" -lt 18 ] || [ "$CURRENT_NODE_MAJOR" -gt 22 ]; then
  echo "[node18] 警告: 当前 node 版本 $(node -v) 不在 18-22 推荐范围"
fi

exec "$@"

#!/bin/sh
# テストの道具を入れ、pre-commit のフックをつなぐ。
# iCloud に node_modules を同期させないため、npm は iCloud の外の一時ディレクトリで動かし、
# できたものを node_modules.nosync（.nosync で終わる名前は iCloud が同期しない）に移して、node_modules をそこへのリンクにする。
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
cp package.json package-lock.json "$tmp/"
(cd "$tmp" && npm ci --no-audit --no-fund)
rm -rf node_modules node_modules.nosync
mv "$tmp/node_modules" node_modules.nosync
rm -rf "$tmp"
ln -s node_modules.nosync node_modules
npx playwright install chromium
git config core.hooksPath .githooks

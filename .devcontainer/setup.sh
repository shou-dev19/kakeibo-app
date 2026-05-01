#!/bin/bash
set -ex

echo "Starting Dev Container setup..."

# ---------------------------------------------------------
# 1. マウントしたボリュームの権限を node ユーザーに修正
# devcontainer.json の mounts で作成されたディレクトリは
# root 所有になることがあるため、ここで node に変更します
# ---------------------------------------------------------
echo "Fixing volume permissions..."
sudo chown -R node:node /home/node/.gemini
sudo chown -R node:node /home/node/.claude
sudo mkdir -p /home/node/.config/gh
sudo chown -R node:node /home/node/.config/gh

sudo apt-get update

# ---------------------------------------------------------
# 2. Git config
# ---------------------------------------------------------
if [ -z "$(git config --global user.email)" ]; then
    if [ -n "$GIT_USER_EMAIL" ]; then
        echo "Configuring global git user.email from environment..."
        git config --global user.email "$GIT_USER_EMAIL"
    else
        echo "GIT_USER_EMAIL not set, skipping git config user.email..."
    fi
fi

if [ -z "$(git config --global user.name)" ]; then
    if [ -n "$GIT_USER_NAME" ]; then
        echo "Configuring global git user.name from environment..."
        git config --global user.name "$GIT_USER_NAME"
    else
        echo "GIT_USER_NAME not set, skipping git config user.name..."
    fi
fi

# ---------------------------------------------------------
# 4. CLI ツールのインストール
# ---------------------------------------------------------
echo "Installing Gemini CLI..."
npm install -g @google/gemini-cli

echo "Installing Claude CLI..."
curl -fsSL https://claude.ai/install.sh | bash

echo "Installing clasp..."
npm install -g @google/clasp

echo "Dev Container setup complete!"

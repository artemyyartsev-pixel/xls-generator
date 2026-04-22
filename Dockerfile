FROM node:22-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# Install ALL deps (including devDeps) so tsx is available for build
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY requirements.txt ./
RUN pip3 install --break-system-packages -r requirements.txt

COPY . .

# Build (tsx is available because devDeps are installed)
RUN npm run build

# Remove devDependencies after build to keep image lean
RUN npm prune --production

ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "dist/index.cjs"]

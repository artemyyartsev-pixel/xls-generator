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

# Explicitly install ALL deps including devDependencies (tsx needs to be available for build)
RUN npm install --include=dev

COPY requirements.txt ./
RUN pip3 install --break-system-packages -r requirements.txt

COPY . .

# Build frontend + server bundle (tsx available from devDeps)
RUN npm run build

# Prune devDeps after build to keep image lean
RUN npm prune --production

ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "dist/index.cjs"]

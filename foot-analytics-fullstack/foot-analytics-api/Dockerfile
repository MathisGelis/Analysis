# API Foot Analytics : NestJS (Node 22) + parseur FMI (Python 3 + pdfplumber).
#   docker build -t foot-analytics-api .
#   docker run -p 4000:4000 --env-file .env foot-analytics-api
# Contexte de build : ce dossier (foot-analytics-api).

# ---- 1. Compilation ---------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- 2. Image d'execution ---------------------------------------------------
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=4000 \
    PYTHON_BIN=/opt/venv/bin/python \
    FMI_PARSER_PATH=parser/parse_fmi.py
WORKDIR /app

# Python + pdfplumber dans un venv (le parseur FMI est lance en sous-processus par l'API).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*
COPY parser/requirements.txt parser/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r parser/requirements.txt
COPY parser/parse_fmi.py parser/parse_fmi.py

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then((r)=>{if(!r.ok)throw 1}).then(()=>process.exit(0)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

FROM node:20-slim
WORKDIR /app

# System deps: openssl (Prisma) + Playwright Chromium dependencies
RUN apt-get update -y && apt-get install -y \
    openssl \
    # Playwright Chromium deps
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

# Install Playwright Chromium browser
RUN npx playwright install chromium

COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
RUN npm run build

CMD ["node", "dist/index.js"]

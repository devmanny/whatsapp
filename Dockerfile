FROM oven/bun:1.2.21-alpine

WORKDIR /app

# Install dependencies for Puppeteer/Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy application files
COPY . .

# Create directory for WhatsApp session data
RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache

# Define volume for persistent WhatsApp session
VOLUME ["/app/.wwebjs_auth"]

# Expose port (if needed for API)
EXPOSE 3000

# Run the application
CMD ["bun", "run", "index.ts"]

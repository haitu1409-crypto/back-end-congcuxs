# Use Node.js 20.11.0
FROM node:20.11.0-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies using npm ci
RUN npm ci --only=production --no-audit --no-fund --prefer-offline

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Start the application
CMD ["node", "server.js"]

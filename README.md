# Backend API - Tạo Dàn Đề

Backend API cho ứng dụng tạo dàn đề, được xây dựng với Node.js và Express.

## 🚀 Tính năng

- ✅ API tạo dàn đề ngẫu nhiên 9x-0x
- ✅ Tối ưu hiệu suất với thuật toán Fisher-Yates
- ✅ Rate limiting để bảo vệ API
- ✅ CORS configuration
- ✅ Compression middleware
- ✅ Security headers với Helmet
- ✅ Logging với Morgan
- ✅ Error handling

## 📋 Yêu cầu hệ thống

- Node.js >= 18.0.0
- npm hoặc yarn

## 🔧 Cài đặt

```bash
# Cài đặt dependencies
npm install

# Copy file .env.example thành .env và cấu hình
cp .env.example .env
```

## 🌐 Cấu hình Environment

Tạo file `.env` với các biến môi trường sau:

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🏃 Chạy ứng dụng

```bash
# Development mode (với nodemon)
npm run dev

# Production mode
npm start
```

## 📡 API Endpoints

### 1. Health Check
```
GET /health
```

Response:
```json
{
  "status": "OK",
  "timestamp": "2025-10-01T00:00:00.000Z",
  "uptime": 123.456,
  "environment": "development"
}
```

### 2. Tạo dàn đề
```
POST /api/dande/generate
Content-Type: application/json

{
  "quantity": 5
}
```

Response:
```json
{
  "success": true,
  "message": "Tạo dàn đề thành công",
  "data": {
    "levelsList": [...],
    "totalSelected": 2485,
    "quantity": 5,
    "timestamp": "2025-10-01T00:00:00.000Z",
    "metadata": {
      "levelCounts": [95, 88, 78, 68, 58, 48, 38, 28, 18, 8],
      "algorithm": "Fisher-Yates Shuffle",
      "version": "1.0.0"
    }
  }
}
```

### 3. Lưu dàn đề (Optional)
```
POST /api/dande/save
Content-Type: application/json

{
  "levels": {...},
  "metadata": {...}
}
```

### 4. Lấy thống kê
```
GET /api/dande/stats
```

## 🏗️ Cấu trúc thư mục

```
back_end_dande/
├── src/
│   ├── controllers/
│   │   └── dande.controller.js    # Xử lý request/response
│   ├── services/
│   │   └── dande.service.js       # Logic nghiệp vụ
│   └── routes/
│       └── dande.routes.js        # Định nghĩa routes
├── server.js                       # Entry point
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 🔒 Bảo mật

- Helmet.js cho security headers
- Rate limiting (100 requests/15 phút mặc định)
- CORS configuration
- Input validation
- Error handling

## 📈 Tối ưu hiệu suất

- Compression middleware giảm kích thước response
- Fisher-Yates shuffle algorithm (O(n) time complexity)
- Efficient memory usage
- No blocking operations

## 🛠️ Development

```bash
# Watch mode với nodemon
npm run dev

# Chạy với PM2 (Production)
pm2 start server.js --name "dande-api"
```

## 📝 License

ISC


# Hướng dẫn cài đặt MongoDB cho Backend

## 1. Cài đặt MongoDB

### Windows:
1. Tải MongoDB Community Server từ: https://www.mongodb.com/try/download/community
2. Cài đặt và khởi động MongoDB service
3. MongoDB sẽ chạy trên port mặc định: 27017

### macOS (với Homebrew):
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb/brew/mongodb-community
```

### Linux (Ubuntu/Debian):
```bash
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
```

## 2. Cấu hình Environment Variables

Tạo file `.env` trong thư mục root của backend:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/dande_thongke

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 3. Cài đặt Dependencies

```bash
cd back_end_dande
npm install
```

## 4. Khởi động Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 5. Kiểm tra kết nối

Nếu thành công, bạn sẽ thấy:
```
✅ Kết nối MongoDB thành công
📍 Database: dande_thongke
🌐 Host: localhost:27017
🚀 Server đang chạy trên port 5000
```

## 6. Sử dụng MongoDB Atlas (Cloud)

Nếu muốn sử dụng MongoDB Atlas thay vì local:

1. Tạo tài khoản tại: https://www.mongodb.com/atlas
2. Tạo cluster mới
3. Lấy connection string
4. Cập nhật `MONGODB_URI` trong file `.env`:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dande_thongke?retryWrites=true&w=majority
```

## 7. Troubleshooting

### Lỗi "option buffermaxentries is not supported"
- Đã được sửa trong code, loại bỏ option deprecated

### Lỗi "MongoNetworkError"
- Kiểm tra MongoDB service đã chạy chưa
- Kiểm tra firewall/port 27017
- Kiểm tra connection string

### Lỗi "Authentication failed"
- Kiểm tra username/password trong connection string
- Kiểm tra database permissions

## 8. API Endpoints

Sau khi server chạy thành công:

- GET `/api/thongke/3-mien` - Lấy thống kê 3 miền
- GET `/api/thongke/:date` - Lấy thống kê theo ngày
- PUT `/api/thongke/:date` - Cập nhật thống kê
- DELETE `/api/thongke/:date` - Xóa thống kê
- GET `/health` - Health check

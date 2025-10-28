# 🚀 HƯỚNG DẪN START BACKEND SERVER

## ✅ Các bước chuẩn bị đã hoàn thành:

1. ✅ **Database có đủ dữ liệu** (181 ngày)
2. ✅ **Tất cả 5 thuật toán AI hoạt động tốt** (BTĐ và BTL)
3. ✅ **Frontend config đã được update** để gọi localhost

## 📋 Start Backend Server:

### Bước 1: Install dependencies (nếu chưa)
```bash
cd c:\webSite_xs\back_end_dande
npm install
```

### Bước 2: Kiểm tra file .env
Đảm bảo file `.env` có:
```
MONGODB_URI=mongodb://localhost:27017/lottery_prediction
PORT=5000
NODE_ENV=development
```

### Bước 3: Start server
```bash
npm start
# hoặc
node server.js
```

### Bước 4: Test API
Sau khi server chạy, test API bằng browser hoặc Postman:

```
http://localhost:5000/api/advanced-soicau/bachthu
```

**Expected Response:**
```json
{
  "predictionDate": "23/10/2025",
  "bachThuDe": {
    "predictions": [
      { "method": "LSTM", "number": "49", "frame": "15 ngày" },
      { "method": "Transformer", "number": "99", "frame": "15 ngày" },
      { "method": "Bayesian", "number": "48", "frame": "60 ngày" },
      { "method": "Genetic", "number": "57", "frame": "60 ngày" },
      { "method": "ARIMA", "number": "41", "frame": "7 ngày (AR)" }
    ],
    "combined": "49",
    "suggestions": ["99", "57", "48"],
    "description": "Dự đoán 2 số cuối Giải Đặc Biệt"
  },
  "bachThuLo": {
    "predictions": [
      { "method": "LSTM", "number": "30", "frame": "15 ngày" },
      { "method": "Transformer", "number": "99", "frame": "15 ngày" },
      { "method": "Bayesian", "number": "17", "frame": "Frequency" },
      { "method": "Genetic", "number": "99", "frame": "Frequency" },
      { "method": "ARIMA", "number": "15", "frame": "7 ngày (AR)" }
    ],
    "combined": "99",
    "suggestions": ["30", "17", "15"],
    "description": "Dự đoán số xuất hiện trong tất cả giải",
    "topFrequent": ["99", "30", "17", "15", "48", "57", "41", "..."]
  },
  "metadata": {
    "predictionFor": "23/10/2025",
    "dataFrom": "24/08/2025",
    "dataTo": "22/10/2025",
    "totalDraws": 60,
    "algorithms": ["LSTM", "Transformer", "Bayesian", "Genetic", "ARIMA"]
  }
}
```

## 🐛 Troubleshooting:

### Vấn đề 1: BTL không có kết quả
**Nguyên nhân:** Có thể một trong 5 thuật toán trả về empty string

**Giải pháp:** 
1. Kiểm tra console log của backend khi API được gọi
2. Xem thuật toán nào trả về rỗng
3. Chạy test script: `node test-btl-btd.js` để debug

### Vấn đề 2: BTĐ thiếu 1 thuật toán
**Nguyên nhân:** Thuật toán bị lỗi khi process dữ liệu thật

**Giải pháp:**
1. Xem log backend để biết thuật toán nào lỗi
2. Kiểm tra dữ liệu có đủ không bằng: `node check-database-data.js`

### Vấn đề 3: Frontend không nhận được data
**Nguyên nhân:** CORS hoặc network issue

**Giải pháp:**
1. Kiểm tra Network tab trong DevTools
2. Đảm bảo backend enable CORS cho localhost:3000
3. Clear cache frontend: localStorage.clear() trong Console

## 🔄 Start Frontend:

```bash
cd c:\webSite_xs\front_end_dande
npm run dev
```

Truy cập: `http://localhost:3000/soi-cau-ai`

## ✅ Checklist cuối cùng:

- [ ] Backend server đang chạy (port 5000)
- [ ] Database có dữ liệu (check bằng check-database-data.js)
- [ ] Test API trả về đầy đủ bachThuDe và bachThuLo
- [ ] Frontend gọi đúng URL (check Network tab)
- [ ] Cache đã được clear (nếu cần)












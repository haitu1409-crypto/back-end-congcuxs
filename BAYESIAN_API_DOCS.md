# Bayesian API Documentation

## Tổng quan

API này cung cấp các endpoint để dự đoán XSMB sử dụng các thuật toán Bayesian:
- **CDM (Compound Dirichlet-Multinomial)**: Thuật toán cơ bản
- **EFDM (Extended Flexible Dirichlet-Multinomial)**: Phiên bản nâng cấp
- **Collaborative Filtering**: Tìm similarity patterns
- **Ensemble**: Kết hợp tất cả phương pháp

## Base URL
```
http://localhost:5000/api/bayesian
```

## Endpoints

### 1. CDM - Dự đoán đề
**GET** `/cdm/de`

Dự đoán đề (2 số cuối giải đặc biệt) sử dụng CDM cơ bản.

**Parameters:**
- `date` (required): Ngày dự đoán (format: YYYY-MM-DD)
- `days` (optional): Số ngày dữ liệu lịch sử (default: 100)

**Example:**
```bash
GET /api/bayesian/cdm/de?date=2024-10-25&days=100
```

**Response:**
```json
{
  "success": true,
  "data": {
    "method": "Bayesian CDM - Đề",
    "targetDate": "2024-10-25",
    "dataDays": 100,
    "predictions": [
      {
        "number": "21",
        "probability": 0.025,
        "percentage": "2.50"
      }
    ],
    "metadata": {
      "totalCount": 100,
      "alpha": 1,
      "dataPoints": 100,
      "formula": "p_j = (count_j + alpha) / (total + alpha * 100)"
    },
    "cacheStats": {
      "keys": 1,
      "hits": 0,
      "misses": 1
    }
  }
}
```

### 2. CDM - Dự đoán lô
**GET** `/cdm/lo`

Dự đoán lô (2 số cuối tất cả giải) sử dụng CDM cơ bản.

**Parameters:**
- `date` (required): Ngày dự đoán (format: YYYY-MM-DD)
- `days` (optional): Số ngày dữ liệu lịch sử (default: 100)

**Example:**
```bash
GET /api/bayesian/cdm/lo?date=2024-10-25&days=100
```

**Response:**
```json
{
  "success": true,
  "data": {
    "method": "Bayesian CDM - Lô",
    "targetDate": "2024-10-25",
    "dataDays": 100,
    "predictions": [...],
    "expectedAppearances": [...],
    "chanceAppearance": [...],
    "metadata": {...},
    "cacheStats": {...}
  }
}
```

### 3. EFDM - Dự đoán đề
**GET** `/efdm/de`

Dự đoán đề sử dụng EFDM (Extended Flexible Dirichlet-Multinomial).

**Parameters:**
- `date` (required): Ngày dự đoán (format: YYYY-MM-DD)
- `days` (optional): Số ngày dữ liệu lịch sử (default: 100)

**Example:**
```bash
GET /api/bayesian/efdm/de?date=2024-10-25&days=100
```

### 4. EFDM - Dự đoán lô
**GET** `/efdm/lo`

Dự đoán lô sử dụng EFDM.

**Parameters:**
- `date` (required): Ngày dự đoán (format: YYYY-MM-DD)
- `days` (optional): Số ngày dữ liệu lịch sử (default: 100)

### 5. Collaborative Filtering
**GET** `/cf`

Dự đoán sử dụng Collaborative Filtering.

**Parameters:**
- `date` (required): Ngày dự đoán (format: YYYY-MM-DD)
- `days` (optional): Số ngày dữ liệu lịch sử (default: 100)
- `topK` (optional): Số lượng kỳ tương tự (default: 5)

**Example:**
```bash
GET /api/bayesian/cf?date=2024-10-25&days=100&topK=5
```

### 6. So sánh CDM vs EFDM
**GET** `/compare`

So sánh kết quả giữa CDM và EFDM.

**Parameters:**
- `date` (required): Ngày dự đoán (format: YYYY-MM-DD)
- `days` (optional): Số ngày dữ liệu lịch sử (default: 100)
- `type` (optional): Loại dự đoán ("de" hoặc "lo", default: "de")

**Example:**
```bash
GET /api/bayesian/compare?date=2024-10-25&days=100&type=de
```

### 7. Ensemble
**GET** `/ensemble`

Kết hợp tất cả phương pháp để dự đoán.

**Parameters:**
- `date` (required): Ngày dự đoán (format: YYYY-MM-DD)
- `days` (optional): Số ngày dữ liệu lịch sử (default: 100)
- `topK` (optional): Số lượng kỳ tương tự cho CF (default: 5)

**Example:**
```bash
GET /api/bayesian/ensemble?date=2024-10-25&days=100&topK=5
```

**Response:**
```json
{
  "success": true,
  "data": {
    "method": "Ensemble (CDM + EFDM + CF)",
    "targetDate": "2024-10-25",
    "dataDays": 100,
    "topK": 5,
    "weights": {
      "cdm": 0.3,
      "efdm": 0.4,
      "cf": 0.3
    },
    "predictions": [...],
    "individualResults": {
      "cdm": [...],
      "efdm": [...],
      "cf": [...]
    },
    "cacheStats": {...}
  }
}
```

### 8. Cache Management

#### Xóa cache
**DELETE** `/cache`

Xóa tất cả cache của các service.

**Example:**
```bash
DELETE /api/bayesian/cache
```

#### Cache stats
**GET** `/cache/stats`

Lấy thống kê cache của các service.

**Example:**
```bash
GET /api/bayesian/cache/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cdm": {
      "keys": 2,
      "hits": 5,
      "misses": 2,
      "ksize": 100,
      "vsize": 1024
    },
    "efdm": {...},
    "cf": {...}
  }
}
```

## Error Handling

Tất cả endpoints trả về error response với format:

```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error message"
}
```

**HTTP Status Codes:**
- `200`: Success
- `400`: Bad Request (thiếu parameters hoặc format sai)
- `500`: Internal Server Error

## Rate Limiting

API có rate limiting: 100 requests per 15 minutes per IP.

## Caching

Tất cả kết quả được cache trong 1-2 giờ để tối ưu performance.

## Testing

Chạy test script:
```bash
node test-bayesian.js
```

## Performance

- **CDM**: ~100-500ms
- **EFDM**: ~200-800ms  
- **Collaborative Filtering**: ~500-1500ms
- **Ensemble**: ~1000-2000ms

## Notes

- Tất cả thời gian tính toán bao gồm cả cache lookup
- Cache hit giảm thời gian response xuống <10ms
- Memory usage: ~50-100MB cho các service
- Dữ liệu cần ít nhất 2 kỳ để CF hoạt động

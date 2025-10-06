/**
 * Test Simple Create - Test tạo bài viết đơn giản không có ảnh
 */

const fetch = require('node-fetch').default;

const API_URL = 'http://localhost:5000/api/articles/create';

// Test data đơn giản
const simpleArticle = {
    title: 'Test Bài Viết Đơn Giản - Không Có Ảnh',
    excerpt: 'Đây là bài viết test đơn giản để kiểm tra API hoạt động',
    content: '<h1>Test Content</h1><p>Đây là nội dung test đơn giản.</p>',
    category: 'giai-ma-giac-mo',
    tags: 'test, bài viết, đơn giản',
    keywords: 'test bài viết, bài viết đơn giản',
    metaDescription: 'Bài viết test đơn giản để kiểm tra API',
    author: 'Admin',
    isFeatured: 'false',
    isTrending: 'false',
    password: '141920'
};

async function testSimpleCreate() {
    try {
        console.log('🚀 Test tạo bài viết đơn giản...');
        
        // Create form data
        const formData = new FormData();
        
        // Add all form fields
        Object.keys(simpleArticle).forEach(key => {
            formData.append(key, simpleArticle[key]);
            console.log(`✅ Added ${key}: ${simpleArticle[key]}`);
        });
        
        console.log('\n📤 Gửi request đến API...');
        
        // Make request
        const response = await fetch(API_URL, {
            method: 'POST',
            body: formData
        });
        
        console.log('📊 Response status:', response.status);
        
        const result = await response.json();
        console.log('📋 Response body:', JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('\n✅ Tạo bài viết thành công!');
            console.log('📄 ID:', result.data._id);
            console.log('🔗 Slug:', result.data.slug);
        } else {
            console.log('\n❌ Lỗi tạo bài viết:', result.message);
            if (result.error) {
                console.log('🔍 Chi tiết lỗi:', result.error);
            }
        }
        
    } catch (error) {
        console.error('\n❌ Lỗi khi test API:', error.message);
    }
}

// Run test
testSimpleCreate();

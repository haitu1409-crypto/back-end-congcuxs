/**
 * Test Article API - Script để test API đăng bài
 */

const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:5000/api/articles';

// Test data
const testArticle = {
    title: 'Test Bài Viết - Giải Mã Giấc Mơ Thấy Trâu',
    excerpt: 'Bài viết test về giải mã giấc mơ thấy trâu và ý nghĩa trong xổ số',
    content: `
        <h2>Giải Mã Giấc Mơ Thấy Trâu</h2>
        <p>Trâu là một trong những con vật may mắn trong văn hóa Việt Nam. Khi bạn mơ thấy trâu, đây có thể là điềm báo tốt lành.</p>
        
        <h3>Ý Nghĩa Giấc Mơ Thấy Trâu</h3>
        <ul>
            <li>Trâu đen: Điềm báo về sự ổn định và bền vững</li>
            <li>Trâu trắng: May mắn và thành công trong công việc</li>
            <li>Trâu vàng: Tài lộc và thịnh vượng</li>
        </ul>
        
        <h3>Số May Mắn Từ Giấc Mơ Trâu</h3>
        <p>Dựa trên kinh nghiệm của các cao thủ, những con số may mắn khi mơ thấy trâu thường là:</p>
        <ul>
            <li>Trâu đen: 12, 21, 32, 43</li>
            <li>Trâu trắng: 01, 10, 19, 28</li>
            <li>Trâu vàng: 06, 15, 24, 33</li>
        </ul>
    `,
    category: 'giai-ma-giac-mo',
    tags: 'giải mã giấc mơ, trâu, số may mắn, xổ số',
    keywords: 'giải mã giấc mơ thấy trâu, số may mắn trâu, mơ thấy trâu đánh con gì',
    metaDescription: 'Giải mã giấc mơ thấy trâu và những con số may mắn trong xổ số. Kinh nghiệm từ các cao thủ về ý nghĩa giấc mơ trâu.',
    author: 'Admin',
    isFeatured: 'true',
    isTrending: 'false',
    password: '141920'
};

async function testCreateArticle() {
    try {
        console.log('🚀 Bắt đầu test tạo bài viết...');
        
        // Create form data
        const formData = new FormData();
        
        // Add all form fields
        Object.keys(testArticle).forEach(key => {
            formData.append(key, testArticle[key]);
        });
        
        // Add a test image (if exists)
        const testImagePath = path.join(__dirname, 'test-image.jpg');
        if (fs.existsSync(testImagePath)) {
            formData.append('featuredImage', fs.createReadStream(testImagePath));
            console.log('📷 Đã thêm ảnh test');
        } else {
            console.log('⚠️ Không tìm thấy ảnh test, sẽ tạo bài viết không có ảnh');
        }
        
        // Make request
        const response = await fetch(`${API_URL}/create`, {
            method: 'POST',
            body: formData,
            headers: {
                ...formData.getHeaders()
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Tạo bài viết thành công!');
            console.log('📄 Slug:', result.data.slug);
            console.log('🔗 URL:', `http://localhost:3000/tin-tuc/${result.data.slug}`);
        } else {
            console.log('❌ Lỗi tạo bài viết:', result.message);
            if (result.error) {
                console.log('🔍 Chi tiết lỗi:', result.error);
            }
        }
        
    } catch (error) {
        console.error('❌ Lỗi khi test API:', error.message);
    }
}

async function testGetArticles() {
    try {
        console.log('\n📰 Test lấy danh sách bài viết...');
        
        const response = await fetch(`${API_URL}?page=1&limit=5`);
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Lấy danh sách bài viết thành công!');
            console.log('📊 Tổng số bài viết:', result.data.pagination.totalArticles);
            console.log('📄 Số bài viết trong trang:', result.data.articles.length);
            
            if (result.data.articles.length > 0) {
                console.log('📝 Bài viết đầu tiên:', result.data.articles[0].title);
            }
        } else {
            console.log('❌ Lỗi lấy danh sách bài viết:', result.message);
        }
        
    } catch (error) {
        console.error('❌ Lỗi khi test API:', error.message);
    }
}

async function testGetCategories() {
    try {
        console.log('\n🏷️ Test lấy danh mục...');
        
        const response = await fetch(`${API_URL}/categories`);
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Lấy danh mục thành công!');
            console.log('📊 Số danh mục:', result.data.length);
            result.data.forEach(category => {
                console.log(`  - ${category.label}: ${category.count} bài viết`);
            });
        } else {
            console.log('❌ Lỗi lấy danh mục:', result.message);
        }
        
    } catch (error) {
        console.error('❌ Lỗi khi test API:', error.message);
    }
}

// Run tests
async function runTests() {
    console.log('🧪 Bắt đầu test Article API...\n');
    
    await testCreateArticle();
    await testGetArticles();
    await testGetCategories();
    
    console.log('\n✅ Hoàn thành test!');
}

// Check if running directly
if (require.main === module) {
    runTests();
}

module.exports = {
    testCreateArticle,
    testGetArticles,
    testGetCategories
};

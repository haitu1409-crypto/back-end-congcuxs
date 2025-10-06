/**
 * Test Create Article - Script test tạo bài viết
 */

const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:5000/api/articles/create';

// Test data
const testArticle = {
    title: 'Giải Mã Giấc Mơ Thấy Trâu - Số May Mắn Trong Xổ Số 2024',
    excerpt: 'Giải mã giấc mơ thấy trâu và những con số may mắn trong xổ số. Kinh nghiệm từ các cao thủ về ý nghĩa giấc mơ trâu đen, trâu trắng, trâu vàng.',
    content: `
        <h1>Giải Mã Giấc Mơ Thấy Trâu - Số May Mắn Trong Xổ Số 2024</h1>
        
        <p>Trâu là một trong những con vật may mắn trong văn hóa Việt Nam. Khi bạn mơ thấy trâu, đây có thể là điềm báo tốt lành về tài lộc và thành công.</p>
        
        <h2>Ý Nghĩa Giấc Mơ Thấy Trâu</h2>
        
        <h3>1. Mơ Thấy Trâu Đen</h3>
        <p>Trâu đen trong giấc mơ thường mang ý nghĩa về sự ổn định và bền vững. Đây là điềm báo tốt cho công việc và tài chính.</p>
        <ul>
            <li><strong>Số may mắn:</strong> 12, 21, 32, 43, 54</li>
            <li><strong>Ý nghĩa:</strong> Sự ổn định, kiên trì, thành công lâu dài</li>
        </ul>
        
        <h3>2. Mơ Thấy Trâu Trắng</h3>
        <p>Trâu trắng là biểu tượng của sự trong sạch và may mắn. Giấc mơ này thường báo hiệu những điều tốt đẹp sắp đến.</p>
        <ul>
            <li><strong>Số may mắn:</strong> 01, 10, 19, 28, 37</li>
            <li><strong>Ý nghĩa:</strong> May mắn, thành công, tài lộc</li>
        </ul>
        
        <h3>3. Mơ Thấy Trâu Vàng</h3>
        <p>Trâu vàng là biểu tượng của tài lộc và thịnh vượng. Đây là giấc mơ rất tốt cho việc đầu tư và kinh doanh.</p>
        <ul>
            <li><strong>Số may mắn:</strong> 06, 15, 24, 33, 42</li>
            <li><strong>Ý nghĩa:</strong> Tài lộc, thịnh vượng, thành công</li>
        </ul>
        
        <h2>Kinh Nghiệm Từ Cao Thủ</h2>
        
        <p>Theo kinh nghiệm của các cao thủ xổ số, khi mơ thấy trâu, bạn nên:</p>
        <ol>
            <li>Ghi nhớ chi tiết giấc mơ (màu sắc, hành động của trâu)</li>
            <li>Chọn số dựa trên màu sắc và tình huống trong mơ</li>
            <li>Chơi đều đặn, không chơi quá khả năng</li>
            <li>Kết hợp với thống kê xổ số để tăng tỷ lệ trúng</li>
        </ol>
        
        <h2>Lưu Ý Quan Trọng</h2>
        
        <p>Xổ số là trò chơi may rủi, giấc mơ chỉ mang tính chất tham khảo. Hãy chơi có trách nhiệm và không chơi quá khả năng tài chính của mình.</p>
        
        <blockquote>
            <p>"Giấc mơ là nguồn cảm hứng, nhưng thống kê mới là nền tảng của chiến thắng." - Cao thủ xổ số</p>
        </blockquote>
    `,
    category: 'giai-ma-giac-mo',
    tags: 'giải mã giấc mơ, trâu, số may mắn, xổ số, mơ thấy trâu, trâu đen, trâu trắng, trâu vàng',
    keywords: 'giải mã giấc mơ thấy trâu, số may mắn trâu, mơ thấy trâu đánh con gì, trâu đen số gì, trâu trắng số gì, trâu vàng số gì, giấc mơ trâu xổ số',
    metaDescription: 'Giải mã giấc mơ thấy trâu và những con số may mắn trong xổ số 2024. Kinh nghiệm từ cao thủ về ý nghĩa giấc mơ trâu đen, trâu trắng, trâu vàng.',
    author: 'Admin',
    isFeatured: 'true',
    isTrending: 'true',
    password: '141920'
};

async function testCreateArticle() {
    try {
        console.log('🚀 Bắt đầu test tạo bài viết...');
        console.log('📝 Tiêu đề:', testArticle.title);
        console.log('📂 Danh mục:', testArticle.category);
        
        // Create form data
        const formData = new FormData();
        
        // Add all form fields
        Object.keys(testArticle).forEach(key => {
            formData.append(key, testArticle[key]);
            console.log(`✅ Added ${key}: ${testArticle[key]}`);
        });
        
        console.log('\n📤 Gửi request đến API...');
        
        // Make request
        const response = await fetch(API_URL, {
            method: 'POST',
            body: formData,
            headers: {
                ...formData.getHeaders()
            }
        });
        
        console.log('📊 Response status:', response.status);
        console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
        
        const result = await response.json();
        console.log('📋 Response body:', JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('\n✅ Tạo bài viết thành công!');
            console.log('📄 ID:', result.data._id);
            console.log('🔗 Slug:', result.data.slug);
            console.log('🌐 URL:', `http://localhost:3000/tin-tuc/${result.data.slug}`);
            console.log('📅 Ngày tạo:', result.data.createdAt);
            console.log('👤 Tác giả:', result.data.author);
            console.log('🏷️ Tags:', result.data.tags);
            console.log('🔑 Keywords:', result.data.keywords);
        } else {
            console.log('\n❌ Lỗi tạo bài viết:', result.message);
            if (result.error) {
                console.log('🔍 Chi tiết lỗi:', result.error);
            }
        }
        
    } catch (error) {
        console.error('\n❌ Lỗi khi test API:', error.message);
        console.error('🔍 Stack trace:', error.stack);
    }
}

// Run test
testCreateArticle();

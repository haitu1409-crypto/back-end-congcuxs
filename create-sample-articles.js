/**
 * Create Sample Articles - Tạo bài viết mẫu với nội dung phong phú
 */

const fetch = require('node-fetch').default;

const API_URL = 'http://localhost:5000/api/articles/create';

const sampleArticles = [
    {
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
        isTrending: 'true'
    },
    {
        title: 'Kinh Nghiệm Chơi Lô Đề 2 Số - Mẹo Tăng Tỷ Lệ Trúng 2024',
        excerpt: 'Chia sẻ kinh nghiệm chơi lô đề 2 số từ các cao thủ. Mẹo vặt, chiến lược và phương pháp tăng tỷ lệ trúng lô đề 2 số hiệu quả.',
        content: `
            <h1>Kinh Nghiệm Chơi Lô Đề 2 Số - Mẹo Tăng Tỷ Lệ Trúng 2024</h1>
            
            <p>Lô đề 2 số là hình thức chơi phổ biến nhất với tỷ lệ trúng cao hơn so với lô đề 3 số, 4 số. Tuy nhiên, để thành công cần có chiến lược và kinh nghiệm.</p>
            
            <h2>Hiểu Về Lô Đề 2 Số</h2>
            
            <p>Lô đề 2 số bao gồm các số từ 00 đến 99, tổng cộng 100 số. Tỷ lệ trúng thường là 1:100, nhưng với chiến lược đúng có thể tăng tỷ lệ trúng.</p>
            
            <h3>Các Loại Lô Đề 2 Số</h3>
            <ul>
                <li><strong>Lô đề đầu:</strong> 2 số cuối của giải đặc biệt</li>
                <li><strong>Lô đề đuôi:</strong> 2 số cuối của giải nhất</li>
                <li><strong>Lô đề tổng:</strong> Tổng 2 số cuối của giải đặc biệt</li>
            </ul>
            
            <h2>Chiến Lược Chơi Lô Đề 2 Số</h2>
            
            <h3>1. Phương Pháp Theo Dõi Chu Kỳ</h3>
            <p>Theo dõi chu kỳ xuất hiện của các số để dự đoán khả năng xuất hiện tiếp theo.</p>
            
            <h3>2. Phương Pháp Soi Cầu</h3>
            <p>Kết hợp nhiều phương pháp soi cầu khác nhau để tăng độ chính xác.</p>
            
            <h3>3. Phương Pháp Quản Lý Vốn</h3>
            <p>Chia vốn thành nhiều phần, không chơi hết vốn trong một lần.</p>
            
            <h2>Mẹo Vặt Từ Cao Thủ</h2>
            
            <ol>
                <li><strong>Chơi đều đặn:</strong> Không chơi theo cảm tính</li>
                <li><strong>Theo dõi thống kê:</strong> Sử dụng dữ liệu lịch sử</li>
                <li><strong>Kết hợp nhiều phương pháp:</strong> Không dựa vào một phương pháp duy nhất</li>
                <li><strong>Quản lý tâm lý:</strong> Giữ tinh thần ổn định</li>
                <li><strong>Học hỏi liên tục:</strong> Cập nhật kiến thức mới</li>
            </ol>
            
            <h2>Lưu Ý Quan Trọng</h2>
            
            <p>Lô đề là trò chơi may rủi, không có phương pháp nào đảm bảo 100% trúng. Hãy chơi có trách nhiệm và không chơi quá khả năng tài chính.</p>
        `,
        category: 'kinh-nghiem-choi-lo-de',
        tags: 'kinh nghiệm chơi lô đề, lô đề 2 số, mẹo chơi lô đề, chiến lược lô đề, cao thủ lô đề',
        keywords: 'kinh nghiệm chơi lô đề 2 số, mẹo chơi lô đề, chiến lược lô đề, cao thủ lô đề, phương pháp soi cầu lô đề',
        metaDescription: 'Kinh nghiệm chơi lô đề 2 số từ các cao thủ. Mẹo vặt, chiến lược và phương pháp tăng tỷ lệ trúng lô đề 2 số hiệu quả nhất 2024.',
        author: 'Admin',
        isFeatured: 'true',
        isTrending: 'false'
    },
    {
        title: 'Thống Kê Xổ Số Miền Bắc - Phân Tích Xu Hướng Số Nóng Lạnh',
        excerpt: 'Thống kê chi tiết xổ số miền Bắc, phân tích xu hướng số nóng, số lạnh. Dữ liệu cập nhật realtime giúp người chơi đưa ra quyết định chính xác.',
        content: `
            <h1>Thống Kê Xổ Số Miền Bắc - Phân Tích Xu Hướng Số Nóng Lạnh</h1>
            
            <p>Xổ số miền Bắc là loại hình xổ số phổ biến nhất với tần suất xổ hàng ngày. Việc phân tích thống kê giúp người chơi hiểu rõ xu hướng và tăng tỷ lệ trúng.</p>
            
            <h2>Đặc Điểm Xổ Số Miền Bắc</h2>
            
            <ul>
                <li><strong>Tần suất:</strong> Xổ hàng ngày (trừ thứ 2 và thứ 4)</li>
                <li><strong>Giờ xổ:</strong> 18h30 hàng ngày</li>
                <li><strong>Số lượng giải:</strong> 27 giải (từ giải đặc biệt đến giải 8)</li>
                <li><strong>Phạm vi:</strong> Các tỉnh miền Bắc</li>
            </ul>
            
            <h2>Phân Tích Số Nóng - Số Lạnh</h2>
            
            <h3>Số Nóng (Hot Numbers)</h3>
            <p>Những số xuất hiện thường xuyên trong thời gian gần đây:</p>
            <ul>
                <li>Số xuất hiện 3-4 lần trong tuần</li>
                <li>Số có chu kỳ xuất hiện ngắn</li>
                <li>Số được nhiều người chơi quan tâm</li>
            </ul>
            
            <h3>Số Lạnh (Cold Numbers)</h3>
            <p>Những số ít xuất hiện hoặc chưa xuất hiện trong thời gian dài:</p>
            <ul>
                <li>Số không xuất hiện trong 2-3 tuần</li>
                <li>Số có chu kỳ xuất hiện dài</li>
                <li>Số ít được người chơi chú ý</li>
            </ul>
            
            <h2>Xu Hướng Theo Ngày Trong Tuần</h2>
            
            <table>
                <tr>
                    <th>Ngày</th>
                    <th>Đặc điểm</th>
                    <th>Gợi ý</th>
                </tr>
                <tr>
                    <td>Thứ 2</td>
                    <td>Không xổ</td>
                    <td>Nghỉ ngơi, phân tích</td>
                </tr>
                <tr>
                    <td>Thứ 3</td>
                    <td>Xổ đầu tuần</td>
                    <td>Chú ý số mới</td>
                </tr>
                <tr>
                    <td>Thứ 4</td>
                    <td>Không xổ</td>
                    <td>Nghỉ ngơi, phân tích</td>
                </tr>
                <tr>
                    <td>Thứ 5</td>
                    <td>Xổ giữa tuần</td>
                    <td>Xu hướng ổn định</td>
                </tr>
                <tr>
                    <td>Thứ 6</td>
                    <td>Xổ cuối tuần</td>
                    <td>Biến động lớn</td>
                </tr>
                <tr>
                    <td>Thứ 7</td>
                    <td>Xổ cuối tuần</td>
                    <td>Biến động lớn</td>
                </tr>
                <tr>
                    <td>Chủ nhật</td>
                    <td>Xổ cuối tuần</td>
                    <td>Biến động lớn</td>
                </tr>
            </table>
            
            <h2>Cách Sử Dụng Thống Kê Hiệu Quả</h2>
            
            <ol>
                <li><strong>Theo dõi hàng ngày:</strong> Cập nhật dữ liệu mới nhất</li>
                <li><strong>Phân tích chu kỳ:</strong> Tìm quy luật xuất hiện</li>
                <li><strong>Kết hợp nhiều yếu tố:</strong> Không dựa vào một chỉ số</li>
                <li><strong>Quản lý rủi ro:</strong> Chơi có trách nhiệm</li>
            </ol>
            
            <h2>Lưu Ý Quan Trọng</h2>
            
            <p>Thống kê chỉ mang tính chất tham khảo, không đảm bảo kết quả. Hãy chơi có trách nhiệm và không chơi quá khả năng tài chính.</p>
        `,
        category: 'thong-ke-xo-so',
        tags: 'thống kê xổ số, xổ số miền bắc, số nóng, số lạnh, xu hướng xổ số, phân tích xổ số',
        keywords: 'thống kê xổ số miền bắc, số nóng số lạnh, xu hướng xổ số, phân tích xổ số, dữ liệu xổ số',
        metaDescription: 'Thống kê chi tiết xổ số miền Bắc, phân tích xu hướng số nóng, số lạnh. Dữ liệu cập nhật realtime giúp người chơi đưa ra quyết định chính xác.',
        author: 'Admin',
        isFeatured: 'false',
        isTrending: 'true'
    }
];

async function createSampleArticles() {
    try {
        console.log('🚀 Creating sample articles...');
        
        for (let i = 0; i < sampleArticles.length; i++) {
            const article = sampleArticles[i];
            console.log(`\n📝 Creating article ${i + 1}: ${article.title}`);
            
            // Create form data
            const formData = new FormData();
            
            // Add all form fields
            Object.keys(article).forEach(key => {
                formData.append(key, article[key]);
            });
            
            // Add password
            formData.append('password', '141920');
            
            // Make request
            const response = await fetch(API_URL, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ Article ${i + 1} created successfully!`);
                console.log(`🔗 Slug: ${result.data.slug}`);
                console.log(`🌐 URL: http://localhost:3000/tin-tuc/${result.data.slug}`);
            } else {
                console.log(`❌ Article ${i + 1} failed: ${result.message}`);
            }
            
            // Wait 1 second between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('\n🎉 Sample articles creation completed!');
        console.log('🌐 Check your news page at: http://localhost:3000/tin-tuc');
        
    } catch (error) {
        console.error('❌ Error creating sample articles:', error.message);
    }
}

// Run the script
createSampleArticles();

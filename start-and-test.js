/**
 * Start Server and Test - Khởi động server và test API
 */

const { spawn } = require('child_process');
const fetch = require('node-fetch');

let serverProcess = null;

// Start server
function startServer() {
    console.log('🚀 Khởi động server...');
    
    serverProcess = spawn('npm', ['run', 'dev'], {
        stdio: 'pipe',
        shell: true
    });
    
    serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('📝 Server:', output);
        
        // Check if server is ready
        if (output.includes('Server is running on port') || output.includes('listening on port')) {
            console.log('✅ Server đã khởi động thành công!');
            setTimeout(testAPI, 2000); // Wait 2 seconds then test
        }
    });
    
    serverProcess.stderr.on('data', (data) => {
        console.error('❌ Server Error:', data.toString());
    });
    
    serverProcess.on('close', (code) => {
        console.log(`🔚 Server đã dừng với code: ${code}`);
    });
}

// Test API
async function testAPI() {
    try {
        console.log('\n🧪 Bắt đầu test API...');
        
        // Test health check
        console.log('1️⃣ Test health check...');
        const healthResponse = await fetch('http://localhost:5000/health');
        const healthData = await healthResponse.json();
        console.log('✅ Health check:', healthData);
        
        // Test get articles
        console.log('\n2️⃣ Test lấy danh sách bài viết...');
        const articlesResponse = await fetch('http://localhost:5000/api/articles?page=1&limit=5');
        const articlesData = await articlesResponse.json();
        console.log('✅ Articles:', articlesData.success ? `${articlesData.data.articles.length} bài viết` : articlesData.message);
        
        // Test get categories
        console.log('\n3️⃣ Test lấy danh mục...');
        const categoriesResponse = await fetch('http://localhost:5000/api/articles/categories');
        const categoriesData = await categoriesResponse.json();
        console.log('✅ Categories:', categoriesData.success ? `${categoriesData.data.length} danh mục` : categoriesData.message);
        
        console.log('\n🎉 Test hoàn thành! Server đang chạy tại http://localhost:5000');
        console.log('📝 Bạn có thể test tạo bài viết bằng cách chạy: node test-create-article.js');
        
    } catch (error) {
        console.error('❌ Lỗi khi test API:', error.message);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Đang dừng server...');
    if (serverProcess) {
        serverProcess.kill();
    }
    process.exit(0);
});

// Start the process
startServer();

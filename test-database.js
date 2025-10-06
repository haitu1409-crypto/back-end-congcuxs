/**
 * Test Database Connection - Kiểm tra kết nối database
 */

const mongoose = require('mongoose');
const Article = require('./src/models/article.model');

async function testDatabase() {
    try {
        console.log('🔌 Testing database connection...');
        
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dande_thongke';
        console.log('📡 Connecting to:', mongoUri.replace(/\/\/.*@/, '//***:***@'));
        
        await mongoose.connect(mongoUri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            bufferCommands: false
        });
        
        console.log('✅ Database connected successfully!');
        
        // Test creating a simple article
        console.log('\n📝 Testing article creation...');
        
        const testArticle = new Article({
            title: 'Test Article - Database Test',
            excerpt: 'This is a test article to verify database connection',
            content: '<p>Test content</p>',
            category: 'giai-ma-giac-mo',
            tags: ['test', 'database'],
            keywords: ['test', 'database'],
            author: 'Test',
            status: 'published',
            featuredImage: {
                url: 'https://via.placeholder.com/1200x630/667eea/ffffff?text=Test+Image',
                publicId: 'test-image',
                alt: 'Test Image'
            }
        });
        
        const savedArticle = await testArticle.save();
        console.log('✅ Article saved successfully!');
        console.log('📄 ID:', savedArticle._id);
        console.log('🔗 Slug:', savedArticle.slug);
        
        // Test finding articles
        console.log('\n🔍 Testing article retrieval...');
        const articles = await Article.find({ status: 'published' }).limit(5);
        console.log('✅ Found', articles.length, 'articles');
        
        // Clean up test article
        await Article.findByIdAndDelete(savedArticle._id);
        console.log('🗑️ Test article cleaned up');
        
        console.log('\n🎉 Database test completed successfully!');
        
    } catch (error) {
        console.error('❌ Database test failed:', error.message);
        console.error('🔍 Error details:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Database disconnected');
    }
}

// Run test
testDatabase();

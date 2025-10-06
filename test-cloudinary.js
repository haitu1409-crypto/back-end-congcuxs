/**
 * Test Cloudinary Connection - Kiểm tra kết nối Cloudinary
 */

const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'db15lvbrw',
    api_key: process.env.CLOUDINARY_API_KEY || '685414381137448',
    api_secret: process.env.CLOUDINARY_API_SECRET || '6CNRrgEZQNt4GFggzkt0G5A8ePY'
});

async function testCloudinary() {
    try {
        console.log('☁️ Testing Cloudinary connection...');
        console.log('📋 Cloud name:', cloudinary.config().cloud_name);
        console.log('🔑 API key:', cloudinary.config().api_key);
        
        // Test connection
        const result = await cloudinary.api.ping();
        console.log('✅ Cloudinary connection successful!');
        console.log('📊 Response:', result);
        
        // Test upload with a simple text file
        console.log('\n📤 Testing file upload...');
        
        // Create a simple test file
        const testFilePath = path.join(__dirname, 'test-upload.txt');
        fs.writeFileSync(testFilePath, 'This is a test file for Cloudinary upload');
        
        try {
            const uploadResult = await cloudinary.uploader.upload(testFilePath, {
                folder: 'test',
                resource_type: 'raw'
            });
            
            console.log('✅ File upload successful!');
            console.log('🔗 URL:', uploadResult.secure_url);
            console.log('🆔 Public ID:', uploadResult.public_id);
            
            // Clean up uploaded file
            await cloudinary.uploader.destroy(uploadResult.public_id);
            console.log('🗑️ Test file cleaned up from Cloudinary');
            
        } catch (uploadError) {
            console.error('❌ Upload failed:', uploadError.message);
        }
        
        // Clean up local test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
            console.log('🗑️ Local test file cleaned up');
        }
        
        console.log('\n🎉 Cloudinary test completed successfully!');
        
    } catch (error) {
        console.error('❌ Cloudinary test failed:', error.message);
        console.error('🔍 Error details:', error);
    }
}

// Run test
testCloudinary();

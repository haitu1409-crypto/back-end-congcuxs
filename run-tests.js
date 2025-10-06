/**
 * Run All Tests - Chạy tất cả các test để debug
 */

const { spawn } = require('child_process');

async function runTest(testName, testFile) {
    return new Promise((resolve, reject) => {
        console.log(`\n🧪 Running ${testName}...`);
        console.log('='.repeat(50));
        
        const testProcess = spawn('node', [testFile], {
            stdio: 'inherit',
            shell: true
        });
        
        testProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ ${testName} completed successfully`);
                resolve();
            } else {
                console.log(`❌ ${testName} failed with code ${code}`);
                reject(new Error(`${testName} failed`));
            }
        });
        
        testProcess.on('error', (error) => {
            console.error(`❌ Error running ${testName}:`, error);
            reject(error);
        });
    });
}

async function runAllTests() {
    try {
        console.log('🚀 Starting comprehensive tests...');
        
        // Test 1: Database connection
        await runTest('Database Connection Test', 'test-database.js');
        
        // Test 2: Cloudinary connection
        await runTest('Cloudinary Connection Test', 'test-cloudinary.js');
        
        // Test 3: Simple article creation (no images)
        await runTest('Simple Article Creation Test', 'test-simple-create.js');
        
        console.log('\n🎉 All tests completed successfully!');
        console.log('\n📋 Summary:');
        console.log('✅ Database connection: OK');
        console.log('✅ Cloudinary connection: OK');
        console.log('✅ Article creation: OK');
        console.log('\n🚀 System is ready for use!');
        
    } catch (error) {
        console.error('\n❌ Test suite failed:', error.message);
        console.log('\n🔍 Please check the error messages above and fix the issues.');
        process.exit(1);
    }
}

// Run all tests
runAllTests();

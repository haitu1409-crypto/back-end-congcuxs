/**
 * Test CORS Fix
 * Script để test CORS sau khi deploy fix
 */

const https = require('https');

console.log('🧪 Testing CORS fix after deployment...\n');

// Test CORS preflight request
function testCORS() {
    const options = {
        hostname: 'api.taodandewukong.pro',
        port: 443,
        path: '/api/thongke/3-mien?startDate=2025-08-31&endDate=2025-09-29&limit=5',
        method: 'OPTIONS',
        headers: {
            'Origin': 'https://taodandewukong.pro',
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Content-Type'
        }
    };

    console.log('📍 Testing preflight request...');
    console.log('   Origin:', options.headers.Origin);
    console.log('   Target:', `https://${options.hostname}${options.path}`);

    const req = https.request(options, (res) => {
        console.log('\n📋 Preflight Response:');
        console.log('   Status:', res.statusCode);
        
        const corsHeaders = [
            'access-control-allow-origin',
            'access-control-allow-methods',
            'access-control-allow-headers',
            'access-control-allow-credentials'
        ];
        
        corsHeaders.forEach(header => {
            const value = res.headers[header];
            console.log(`   ${header}: ${value || '❌ Missing'}`);
        });
        
        if (res.statusCode === 204) {
            console.log('\n✅ Preflight successful! Testing actual request...');
            testActualRequest();
        } else {
            console.log('\n❌ Preflight failed!');
        }
    });

    req.on('error', (error) => {
        console.error('❌ Request failed:', error.message);
    });

    req.end();
}

// Test actual GET request
function testActualRequest() {
    const options = {
        hostname: 'api.taodandewukong.pro',
        port: 443,
        path: '/api/thongke/3-mien?startDate=2025-08-31&endDate=2025-09-29&limit=5',
        method: 'GET',
        headers: {
            'Origin': 'https://taodandewukong.pro',
            'Content-Type': 'application/json'
        }
    };

    console.log('\n📍 Testing actual GET request...');

    const req = https.request(options, (res) => {
        console.log('\n📋 GET Response:');
        console.log('   Status:', res.statusCode);
        
        const corsHeaders = [
            'access-control-allow-origin',
            'access-control-allow-methods',
            'access-control-allow-headers',
            'access-control-allow-credentials'
        ];
        
        corsHeaders.forEach(header => {
            const value = res.headers[header];
            console.log(`   ${header}: ${value || '❌ Missing'}`);
        });
        
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                console.log('\n✅ API Response received successfully!');
                console.log('   Success:', jsonData.success);
                if (jsonData.data && jsonData.data.statistics) {
                    console.log('   Records:', jsonData.data.statistics.length);
                }
            } catch (e) {
                console.log('\n❌ Failed to parse response:', data.substring(0, 200));
            }
        });
    });

    req.on('error', (error) => {
        console.error('❌ GET request failed:', error.message);
    });

    req.end();
}

// Run tests
testCORS();

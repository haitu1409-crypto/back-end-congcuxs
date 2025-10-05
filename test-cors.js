/**
 * Test CORS Configuration
 * Script để test CORS headers từ frontend domain
 */

const https = require('https');

// Test CORS với domain frontend
const options = {
    hostname: 'api.taodandewukong.pro',
    port: 443,
    path: '/api/thongke/3-mien?startDate=2025-08-31&endDate=2025-09-29&limit=31',
    method: 'OPTIONS',
    headers: {
        'Origin': 'https://taodandewukong.pro',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type'
    }
};

console.log('🧪 Testing CORS preflight request...');
console.log('📍 Origin:', options.headers.Origin);
console.log('🎯 Target:', `https://${options.hostname}${options.path}`);

const req = https.request(options, (res) => {
    console.log('\n✅ Response Status:', res.statusCode);
    console.log('📋 CORS Headers:');
    
    const corsHeaders = [
        'access-control-allow-origin',
        'access-control-allow-methods',
        'access-control-allow-headers',
        'access-control-allow-credentials'
    ];
    
    corsHeaders.forEach(header => {
        const value = res.headers[header];
        console.log(`   ${header}: ${value || '❌ Not set'}`);
    });
    
    if (res.statusCode === 204) {
        console.log('\n✅ CORS preflight successful!');
    } else {
        console.log('\n❌ CORS preflight failed!');
    }
});

req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
});

req.end();

// Test actual GET request
setTimeout(() => {
    console.log('\n🧪 Testing actual GET request...');
    
    const getOptions = {
        hostname: 'api.taodandewukong.pro',
        port: 443,
        path: '/api/thongke/3-mien?startDate=2025-08-31&endDate=2025-09-29&limit=31',
        method: 'GET',
        headers: {
            'Origin': 'https://taodandewukong.pro',
            'Content-Type': 'application/json'
        }
    };
    
    const getReq = https.request(getOptions, (res) => {
        console.log('\n✅ GET Response Status:', res.statusCode);
        console.log('📋 CORS Headers:');
        
        const corsHeaders = [
            'access-control-allow-origin',
            'access-control-allow-methods',
            'access-control-allow-headers',
            'access-control-allow-credentials'
        ];
        
        corsHeaders.forEach(header => {
            const value = res.headers[header];
            console.log(`   ${header}: ${value || '❌ Not set'}`);
        });
        
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                console.log('\n✅ API Response received successfully!');
                console.log('📊 Data keys:', Object.keys(jsonData));
            } catch (e) {
                console.log('\n❌ Failed to parse response:', data.substring(0, 200));
            }
        });
    });
    
    getReq.on('error', (error) => {
        console.error('❌ GET request failed:', error.message);
    });
    
    getReq.end();
}, 1000);

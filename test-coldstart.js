/**
 * Cold Start Test Script
 * Test script để kiểm tra hiệu quả của hệ thống chống cold start
 */

const axios = require('axios');

class ColdStartTester {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.results = [];
        this.isRunning = false;
    }

    /**
     * Test single endpoint
     */
    async testEndpoint(endpoint, name) {
        const startTime = Date.now();

        try {
            const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                timeout: 10000,
                validateStatus: (status) => status === 200
            });

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            const result = {
                endpoint,
                name,
                success: true,
                responseTime,
                status: response.status,
                data: response.data,
                timestamp: new Date().toISOString()
            };

            console.log(`✅ ${name}: ${responseTime}ms`);
            return result;

        } catch (error) {
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            const result = {
                endpoint,
                name,
                success: false,
                responseTime,
                error: error.message,
                status: error.response?.status || 'TIMEOUT',
                timestamp: new Date().toISOString()
            };

            console.log(`❌ ${name}: ${responseTime}ms - ${error.message}`);
            return result;
        }
    }

    /**
     * Run comprehensive test
     */
    async runTest() {
        console.log('🚀 Starting Cold Start Prevention Test...\n');

        const endpoints = [
            { path: '/health', name: 'Health Check' },
            { path: '/healthz', name: 'Health Check (Alt)' },
            { path: '/ping', name: 'Ping Test' },
            { path: '/keepalive/status', name: 'Keep-Alive Status' },
            { path: '/', name: 'Root Endpoint' }
        ];

        // Test all endpoints
        for (const endpoint of endpoints) {
            const result = await this.testEndpoint(endpoint.path, endpoint.name);
            this.results.push(result);

            // Wait 1 second between tests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.printSummary();
    }

    /**
     * Continuous monitoring
     */
    async startMonitoring(intervalMinutes = 5) {
        console.log(`🔄 Starting continuous monitoring (every ${intervalMinutes} minutes)...\n`);
        this.isRunning = true;

        const monitor = async () => {
            if (!this.isRunning) return;

            console.log(`\n⏰ ${new Date().toLocaleString()} - Monitoring Check:`);

            const result = await this.testEndpoint('/healthz', 'Health Check');
            this.results.push(result);

            // Schedule next check
            setTimeout(monitor, intervalMinutes * 60 * 1000);
        };

        // Start monitoring
        monitor();
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        console.log('\n🛑 Stopping monitoring...');
        this.isRunning = false;
    }

    /**
     * Print test summary
     */
    printSummary() {
        console.log('\n📊 TEST SUMMARY:');
        console.log('='.repeat(50));

        const successful = this.results.filter(r => r.success);
        const failed = this.results.filter(r => !r.success);

        console.log(`✅ Successful: ${successful.length}/${this.results.length}`);
        console.log(`❌ Failed: ${failed.length}/${this.results.length}`);

        if (successful.length > 0) {
            const avgResponseTime = successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length;
            const minResponseTime = Math.min(...successful.map(r => r.responseTime));
            const maxResponseTime = Math.max(...successful.map(r => r.responseTime));

            console.log(`\n⏱️  Response Time Statistics:`);
            console.log(`   Average: ${avgResponseTime.toFixed(2)}ms`);
            console.log(`   Min: ${minResponseTime}ms`);
            console.log(`   Max: ${maxResponseTime}ms`);

            // Cold start detection
            if (maxResponseTime > 2000) {
                console.log(`\n🚨 COLD START DETECTED!`);
                console.log(`   Max response time: ${maxResponseTime}ms (>2000ms)`);
            } else if (maxResponseTime > 1000) {
                console.log(`\n⚠️  SLOW RESPONSE DETECTED!`);
                console.log(`   Max response time: ${maxResponseTime}ms (>1000ms)`);
            } else {
                console.log(`\n✅ EXCELLENT PERFORMANCE!`);
                console.log(`   All responses under 1000ms`);
            }
        }

        if (failed.length > 0) {
            console.log(`\n❌ Failed Tests:`);
            failed.forEach(f => {
                console.log(`   ${f.name}: ${f.error}`);
            });
        }

        console.log('\n' + '='.repeat(50));
    }

    /**
     * Export results to JSON
     */
    exportResults(filename = 'coldstart-test-results.json') {
        const fs = require('fs');
        const data = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.results.length,
                successful: this.results.filter(r => r.success).length,
                failed: this.results.filter(r => !r.success).length
            },
            results: this.results
        };

        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        console.log(`\n📁 Results exported to: ${filename}`);
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const baseUrl = args[0] || 'http://localhost:5000';
    const mode = args[1] || 'test';

    const tester = new ColdStartTester(baseUrl);

    console.log(`🎯 Testing: ${baseUrl}`);
    console.log(`📋 Mode: ${mode}\n`);

    switch (mode) {
        case 'test':
            await tester.runTest();
            tester.exportResults();
            break;

        case 'monitor':
            await tester.runTest();
            await tester.startMonitoring(5); // Monitor every 5 minutes

            // Handle graceful shutdown
            process.on('SIGINT', () => {
                tester.stopMonitoring();
                tester.printSummary();
                tester.exportResults();
                process.exit(0);
            });
            break;

        default:
            console.log('Usage:');
            console.log('  node test-coldstart.js [url] [mode]');
            console.log('');
            console.log('Modes:');
            console.log('  test     - Run single test (default)');
            console.log('  monitor  - Run continuous monitoring');
            console.log('');
            console.log('Examples:');
            console.log('  node test-coldstart.js http://localhost:5000 test');
            console.log('  node test-coldstart.js https://your-api.com monitor');
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = ColdStartTester;

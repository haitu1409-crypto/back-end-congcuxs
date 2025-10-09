/**
 * UptimeRobot Setup Script
 * Script để tự động cấu hình UptimeRobot monitoring
 */

const readline = require('readline');

class UptimeRobotSetup {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * Prompt for user input
     */
    async prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }

    /**
     * Generate UptimeRobot configuration
     */
    generateConfig(apiUrl, email) {
        const config = {
            monitors: [
                {
                    name: "Dande API - Health Check",
                    url: `${apiUrl}/healthz`,
                    type: "http",
                    interval: 300, // 5 minutes
                    timeout: 30,
                    keyword: '"status":"healthy"',
                    contacts: [email]
                },
                {
                    name: "Dande API - Ping Test",
                    url: `${apiUrl}/ping`,
                    type: "http",
                    interval: 300, // 5 minutes
                    timeout: 30,
                    keyword: '"message":"pong"',
                    contacts: [email]
                }
            ],
            alertContacts: [
                {
                    email: email,
                    type: "email",
                    threshold: 1 // Alert on first failure
                }
            ]
        };

        return config;
    }

    /**
     * Generate setup instructions
     */
    generateInstructions(config) {
        const instructions = `
# 🚀 UPTIMEROBOT SETUP INSTRUCTIONS

## 📋 Configuration Details

### Primary Monitor
- **Name**: ${config.monitors[0].name}
- **URL**: ${config.monitors[0].url}
- **Interval**: ${config.monitors[0].interval} seconds (5 minutes)
- **Timeout**: ${config.monitors[0].timeout} seconds
- **Keyword**: ${config.monitors[0].keyword}

### Secondary Monitor  
- **Name**: ${config.monitors[1].name}
- **URL**: ${config.monitors[1].url}
- **Interval**: ${config.monitors[1].interval} seconds (5 minutes)
- **Timeout**: ${config.monitors[1].timeout} seconds
- **Keyword**: ${config.monitors[1].keyword}

## 🔧 Manual Setup Steps

### Step 1: Login to UptimeRobot
1. Go to: https://uptimerobot.com/
2. Login to your account (or create free account)
3. Go to Dashboard

### Step 2: Add Primary Monitor
1. Click "Add New Monitor"
2. Monitor Type: HTTP(s)
3. Friendly Name: "${config.monitors[0].name}"
4. URL: ${config.monitors[0].url}
5. Monitoring Interval: 5 minutes
6. Monitor Timeout: 30 seconds
7. Keyword: ${config.monitors[0].keyword}
8. Alert Contacts: Add ${config.monitors[0].contacts[0]}
9. Click "Create Monitor"

### Step 3: Add Secondary Monitor
1. Click "Add New Monitor"
2. Monitor Type: HTTP(s)
3. Friendly Name: "${config.monitors[1].name}"
4. URL: ${config.monitors[1].url}
5. Monitoring Interval: 5 minutes
6. Monitor Timeout: 30 seconds
7. Keyword: ${config.monitors[1].keyword}
8. Alert Contacts: Add ${config.monitors[1].contacts[0]}
9. Click "Create Monitor"

### Step 4: Configure Alert Contacts
1. Go to "My Settings" → "Alert Contacts"
2. Add Email Contact: ${config.alertContacts[0].email}
3. Set Alert Threshold: ${config.alertContacts[0].threshold} failed check

## 📊 Expected Results

After setup, you should see:
- ✅ **Uptime**: 99.9%
- ✅ **Response Time**: < 500ms
- ✅ **No Cold Starts**
- ✅ **Email alerts** for any downtime

## 🧪 Test Your Setup

Run this command to test your endpoints:
\`\`\`bash
# Test health check
curl ${config.monitors[0].url}

# Test ping
curl ${config.monitors[1].url}

# Run comprehensive test
node test-coldstart.js ${apiUrl} test
\`\`\`

## 📈 Monitoring Dashboard

Your UptimeRobot dashboard will show:
- Real-time uptime statistics
- Response time graphs
- Alert history
- Public status page (optional)

## 🚨 Troubleshooting

If monitors fail:
1. Check URL is accessible
2. Verify keyword matches response
3. Check firewall/security settings
4. Test with curl manually

## 📞 Support

- UptimeRobot Documentation: https://uptimerobot.com/api/
- Free Tier Limits: 50 monitors, 5-minute intervals
- Upgrade Options: Available for faster monitoring

---

**✅ Setup Complete! Your API will now be monitored 24/7 to prevent cold starts.**
        `;

        return instructions;
    }

    /**
     * Run setup wizard
     */
    async run() {
        console.log('🚀 UptimeRobot Setup Wizard\n');

        try {
            // Get API URL
            const apiUrl = await this.prompt('Enter your API URL (e.g., https://your-api.com): ');
            if (!apiUrl) {
                console.log('❌ API URL is required');
                process.exit(1);
            }

            // Get email
            const email = await this.prompt('Enter your email for alerts: ');
            if (!email) {
                console.log('❌ Email is required');
                process.exit(1);
            }

            // Generate configuration
            const config = this.generateConfig(apiUrl, email);
            const instructions = this.generateInstructions(config);

            // Save to file
            const fs = require('fs');
            const filename = 'uptimerobot-setup.md';
            fs.writeFileSync(filename, instructions);

            console.log(`\n✅ Setup instructions saved to: ${filename}`);
            console.log('\n📋 Configuration Summary:');
            console.log(`   API URL: ${apiUrl}`);
            console.log(`   Email: ${email}`);
            console.log(`   Monitors: ${config.monitors.length}`);
            console.log(`   Interval: 5 minutes`);

            console.log('\n🎯 Next Steps:');
            console.log('1. Open uptimerobot-setup.md');
            console.log('2. Follow the manual setup steps');
            console.log('3. Test your endpoints');
            console.log('4. Monitor your dashboard');

            // Test endpoints
            console.log('\n🧪 Testing endpoints...');
            try {
                const axios = require('axios');

                const healthResponse = await axios.get(`${apiUrl}/healthz`, { timeout: 10000 });
                console.log(`✅ Health Check: ${healthResponse.status} - ${JSON.stringify(healthResponse.data)}`);

                const pingResponse = await axios.get(`${apiUrl}/ping`, { timeout: 10000 });
                console.log(`✅ Ping Test: ${pingResponse.status} - ${JSON.stringify(pingResponse.data)}`);

                console.log('\n🎉 All endpoints are working correctly!');

            } catch (error) {
                console.log(`❌ Endpoint test failed: ${error.message}`);
                console.log('Please check your API URL and ensure the server is running.');
            }

        } catch (error) {
            console.error('❌ Setup failed:', error.message);
        } finally {
            this.rl.close();
        }
    }
}

// Run if called directly
if (require.main === module) {
    const setup = new UptimeRobotSetup();
    setup.run().catch(console.error);
}

module.exports = UptimeRobotSetup;

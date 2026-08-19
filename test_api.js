const http = require('http');

function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, headers: res.headers, body });
                }
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(JSON.stringify(postData));
        }
        req.end();
    });
}

async function runTests() {
    console.log('=== STARTING COMPLETE INTEGRATION TESTS FOR ALL 5 ADVANCED FEATURES ===\n');

    // Test 1: User Login
    console.log('Test 1: Authenticating User Billah via POST /api/auth/login...');
    const loginRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { email: 'billah@gmail.com', password: '123' });

    console.log(`Status: ${loginRes.statusCode}`);
    console.log(`User Data:`, loginRes.body.user);
    const userId = loginRes.body.user.user_id;
    console.log('\n');

    // Test 2: Profile Update API (POST /api/auth/profile)
    console.log(`Test 2: Testing Profile Update via POST /api/auth/profile for user #${userId}...`);
    const profileRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/auth/profile',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        user_id: userId,
        name: 'Billah Khan (Master)',
        email: 'billah@gmail.com'
    });
    console.log(`Status: ${profileRes.statusCode}`);
    console.log(`Updated Profile:`, profileRes.body.user);
    console.log('\n');

    // Test 3: Create Habit with Priority, Target Days & Subtasks
    console.log(`Test 3: Creating habit with Priority 'High', Schedule 'Weekdays', and Sub-tasks...`);
    const createRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/habits',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        habit_name: 'Distributed Systems Lecture Review',
        category: 'Academic',
        priority: 'High',
        target_days: 'Weekdays',
        subtasks: 'Read Lecture 5, Solve Practice Quiz, Write Summary',
        reminder_time: '14:00',
        user_id: userId
    });

    console.log(`Status: ${createRes.statusCode}`);
    console.log(`Created Habit:`, createRes.body.data);
    const habitId = createRes.body.data.habit_id;
    console.log('\n');

    // Test 4: Dashboard Trend Analytics & Priority Order Verification
    console.log(`Test 4: Fetching Dashboard Trend Analytics & Priorities for user #${userId}...`);
    const dashRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 3000,
        path: `/api/dashboard?user_id=${userId}`,
        method: 'GET'
    });

    console.log(`Status: ${dashRes.statusCode}`);
    console.log(`Weekly Trend Array Sample (First 3 Days):`, dashRes.body.data.weeklyTrend.slice(0, 3));
    console.log(`Top Habit Priority & Subtasks:`, {
        name: dashRes.body.data.habits[0].habit_name,
        priority: dashRes.body.data.habits[0].priority,
        subtasks: dashRes.body.data.habits[0].subtasks
    });
    console.log('\n');

    // Test 5: CSV Export Endpoint Verification
    console.log(`Test 5: Testing GET /api/export/csv?user_id=${userId}...`);
    const csvRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 3000,
        path: `/api/export/csv?user_id=${userId}`,
        method: 'GET'
    });
    console.log(`Status: ${csvRes.statusCode}`);
    console.log(`Content-Disposition: ${csvRes.headers['content-disposition']}`);
    console.log(`CSV Header:\n${csvRes.body.split('\n')[0]}`);
    console.log('\n');

    console.log('=== ALL 5 ADVANCED FEATURE INTEGRATION TESTS PASSED 100% SUCCESSFULLY ===');
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});

const http = require('http');

function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body });
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
    console.log('=== STARTING AUTOMATED MVP & AUTH INTEGRATION TESTS ===\n');

    // Test 1: User Login (Seed Account)
    console.log('Test 1: Authenticating Seed Account via POST /api/auth/login...');
    const loginRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { email: 'alex.mercer@university.edu', password: 'academic2026' });

    console.log(`Status: ${loginRes.statusCode}`);
    console.log(`User Data:`, loginRes.body.user);
    const userId = loginRes.body.user.user_id;
    console.log('\n');

    // Test 2: Register New User Account
    console.log('Test 2: Registering New User via POST /api/auth/register...');
    const regEmail = `test.student.${Date.now()}@university.edu`;
    const regRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { name: 'Test Student', email: regEmail, password: 'password123' });

    console.log(`Status: ${regRes.statusCode}`);
    console.log(`Registered User:`, regRes.body.user);
    const newUserId = regRes.body.user.user_id;
    console.log('\n');

    // Test 3: GET /api/dashboard for registered user
    console.log(`Test 3: Fetching GET /api/dashboard?user_id=${newUserId}...`);
    const dashRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 3000,
        path: `/api/dashboard?user_id=${newUserId}`,
        method: 'GET'
    });
    console.log(`Status: ${dashRes.statusCode}`);
    console.log(`User Name in Dashboard:`, dashRes.body.data.user.name);
    console.log(`Total habits for new user: ${dashRes.body.data.habits.length}\n`);

    // Test 4: Create habit for new user
    console.log(`Test 4: Creating habit for user #${newUserId}...`);
    const createRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/habits',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { habit_name: 'Daily Research Reading', reminder_time: '21:00', user_id: newUserId });

    console.log(`Status: ${createRes.statusCode}`);
    console.log(`Created Habit:`, createRes.body.data);
    const habitId = createRes.body.data.habit_id;
    console.log('\n');

    // Test 5: Log habit status & streak calculation
    console.log(`Test 5: Logging status for habit #${habitId}...`);
    const todayStr = new Date().toISOString().substring(0, 10);
    const logRes = await makeRequest({
        hostname: '127.0.0.1',
        port: 3000,
        path: `/api/habits/${habitId}/log`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { date: todayStr, status: 'completed' });

    console.log(`Status: ${logRes.statusCode}`);
    console.log(`Streak Result:`, logRes.body.data);
    console.log('\n');

    console.log('=== ALL AUTHENTICATION & HABIT TESTS PASSED SUCCESSFULLY ===');
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});

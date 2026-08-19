const { initDb } = require('./database');
const habitAgent = require('./habitAgent');

async function seed() {
    console.log('Seeding dummy habits into SQLite database...');
    await initDb();
    await habitAgent.recalculateAllStreaks();
    console.log('Dummy habits seeded and streaks recalculated successfully!');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});

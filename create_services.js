require('dotenv').config();
const connectDB = require('./config/db');
const Service = require('./models/Service');

const servicesList = [
  'Website (full build)',
  'Connector Apps / Small Web Additions',
  'Social Media Optimisation',
  'Design — Brochures / Emailers',
  'Standees / Backdrops / Advertisements',
  'Films & Edits',
  'AI-enabled Animation / Motion Graphics',
  'Reels & Shorts',
  'Podcasts (per episode)',
  'Strategy & Presentations',
  'Business Development',
  'Paper Advertisement Design',
  'Other Design Interventions',
  'Photography / Filming (per shoot day)'
];

async function createServices() {
  try {
    await connectDB();
    console.log('Inserting / updating services database collection...');

    for (const name of servicesList) {
      await Service.updateOne(
        { name },
        { $setOnInsert: { name, hours: 0 } },
        { upsert: true }
      );
    }

    const allServices = await Service.find({}).sort('name');
    console.log(`\n✅ Successfully configured ${allServices.length} services:`);
    allServices.forEach(s => console.log(` - ${s.name}`));

    process.exit(0);
  } catch (err) {
    console.error('❌ Error inserting services:', err);
    process.exit(1);
  }
}

createServices();

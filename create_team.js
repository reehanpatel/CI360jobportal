require('dotenv').config();
const connectDB = require('./config/db');
const Personnel = require('./models/Personnel');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

const teamDuties = {
  'Pramit': 'Founder, Strategy, Business Development, Content Management',
  'Aashit': 'Founder, Business Development, Finance',
  'Urna': 'COO, CS, Content, Operations, Billing, Overall Supervision',
  'Mansi': 'Strategy, BD, Content, Backup to Pramit, CS',
  'Chitra': 'CS, SMO',
  'Arushi': 'SMO',
  'Manan': 'CS, Creative Lead',
  'Mary': 'Creatives, Animations, AI, Editing of Reels etc, Storytelling',
  'Ajay': 'Editing',
  'Aarya': 'Graphics, Creative',
  'Aadya': 'Graphics, Creative',
  'John': 'Websites — All of them, Quality Control',
  'Meshwa': 'Website Support',
  'Ekta': 'Accounts',
  'Pradeep': 'Websites',
  'Harshada': 'SEO',
  'Arjun': 'Business Development, Prospect Pitching',
  'Shalini': 'Business Development, Prospect Pitching',
  'Khushi': 'Operations (intern, just joined)',
  'Reehan': 'Websites — part of (intern)',
  'Dhawal': 'Not currently functioning — part of the team',
  'External': 'SEO and other requirements, as needed'
};

const superadminNames = ['Pramit', 'Aashit', 'Urna', 'Mansi'];

async function createTeam() {
  try {
    await connectDB();
    console.log('Updating Personnel duties and User accounts...');

    const adminHash = await bcrypt.hash('Admin123!', 10);
    const empHash = await bcrypt.hash('Employee123!', 10);

    const results = [];

    for (const [name, duties] of Object.entries(teamDuties)) {
      const isSuper = superadminNames.includes(name);
      const role = isSuper ? 'superadmin' : 'employee';
      const pass = isSuper ? 'Admin123!' : 'Employee123!';
      const hash = isSuper ? adminHash : empHash;

      // Create or update Personnel with exact duties
      let p = await Personnel.findOne({ name });
      if (!p) {
        p = await Personnel.create({ name, duties, capacity: 48, status: 'active' });
      } else {
        p.duties = duties;
        await p.save();
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `${slug}@ci360.local`;

      let u = await User.findOne({ email });
      if (!u) {
        u = await User.create({
          name: p.name,
          email,
          passwordHash: hash,
          role,
          personnelId: p._id,
          active: true
        });
      } else {
        u.role = role;
        u.personnelId = p._id;
        u.name = p.name;
        await u.save();
      }

      results.push({ Name: p.name, Duties: p.duties, Username: slug, Email: email, Role: isSuper ? 'Super Admin' : 'Employee' });
    }

    console.log(`\n✅ Successfully updated ${results.length} Team Members with Posts & Duties:`);
    console.table(results);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating team duties:', err);
    process.exit(1);
  }
}

createTeam();

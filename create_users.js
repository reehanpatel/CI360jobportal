require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Personnel = require('./models/Personnel');
const Client = require('./models/Client');

async function createAccounts() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is missing in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected to host:', mongoose.connection.host);

    // 1. Dedicated Super Admin Accounts
    const superAccounts = [
      { name: 'Super Admin', email: 'superadmin@ci360.local', pass: 'Admin123!' },
      { name: 'Super Admin', email: 'admin@ci360.local', pass: 'Admin123!' }
    ];

    for (const sa of superAccounts) {
      let superUser = await User.findOne({ email: sa.email });
      if (!superUser) {
        superUser = await User.create({
          name: sa.name,
          email: sa.email,
          passwordHash: await bcrypt.hash(sa.pass, 10),
          role: 'superadmin',
          active: true,
        });
        console.log(`✅ Created Super Admin Account -> ${sa.email} / ${sa.pass}`);
      } else {
        superUser.role = 'superadmin';
        superUser.active = true;
        await superUser.save();
        console.log(`ℹ️ Super Admin Account ready -> ${sa.email}`);
      }
    }

    // 2. Employee Account & Personnel Record
    let employeePersonnel = await Personnel.findOne({ name: 'Demo Employee' });
    if (!employeePersonnel) {
      employeePersonnel = await Personnel.create({
        name: 'Demo Employee',
        duties: 'Development & Operations',
        capacity: 48,
        status: 'active',
      });
      console.log('✅ Created Personnel record for Demo Employee');
    }

    const empEmail = 'employee@ci360.local';
    const empPass = 'Employee123!';
    let empUser = await User.findOne({ email: empEmail });
    if (!empUser) {
      empUser = await User.create({
        name: 'Demo Employee',
        email: empEmail,
        passwordHash: await bcrypt.hash(empPass, 10),
        role: 'employee',
        personnelId: employeePersonnel._id,
        active: true,
      });
      console.log(`✅ Created Employee Account -> ${empEmail} / ${empPass}`);
    } else {
      console.log(`ℹ️ Employee Account already exists -> ${empEmail}`);
    }

    // 3. Client Account & Client Record
    let clientRecord = await Client.findOne({ name: 'Demo Client' });
    if (!clientRecord) {
      clientRecord = await Client.create({
        name: 'Demo Client',
        notes: 'Primary Account',
      });
      console.log('✅ Created Client record for Demo Client');
    }

    const clientEmail = 'client@ci360.local';
    const clientPass = 'Client123!';
    let clientUser = await User.findOne({ email: clientEmail });
    if (!clientUser) {
      clientUser = await User.create({
        name: 'Demo Client',
        email: clientEmail,
        passwordHash: await bcrypt.hash(clientPass, 10),
        role: 'client',
        clientId: clientRecord._id,
        active: true,
      });
      console.log(`✅ Created Client Account -> ${clientEmail} / ${clientPass}`);
    } else {
      console.log(`ℹ️ Client Account already exists -> ${clientEmail}`);
    }

    console.log('\nAll 3 user accounts are created and ready!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating accounts:', err.message);
    process.exit(1);
  }
}

createAccounts();

require('dotenv').config();
const connectDB = require('./config/db');
const Client = require('./models/Client');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

const clientNames = [
  'Vardan',
  'Shatayu',
  'Crave',
  'VNA',
  'Shree Sawa',
  'Thehrav',
  'LEOZ',
  'PIV',
  'Chaitanya',
  'Media Buzz',
  'Times Abroad',
  'Times Property',
  'Times MSME',
  'Times Mike Drop',
  'Ananta',
  'Ananta Aspen',
  'IUF',
  'Gaudiya',
  'Brinzz',
  'Station Satcom',
  'Gharenu',
  'Goa',
  'The Bottle Shop',
  'Kumbh Mela',
  'Haryana Projects',
  'MMCF',
  'Dhanda.ai',
  'Signo',
  'Tolvv Sign',
  'Matrix Book Cover',
  'Samunnati',
  'Interview Box',
  'Katrankari',
  'IFB',
  'Network 18'
];

async function createClientsAndUsers() {
  try {
    await connectDB();
    console.log('Inserting 35 clients and creating user accounts...');

    const defaultPassword = 'Client123!';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const results = [];

    for (const name of clientNames) {
      // Create or update Client
      let client = await Client.findOne({ name });
      if (!client) {
        client = await Client.create({ name, notes: 'Client account' });
      }

      // Generate email slug
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `${slug}@ci360.local`;

      // Create or update User
      let user = await User.findOne({ email });
      if (!user) {
        user = await User.create({
          name: client.name,
          email,
          passwordHash,
          role: 'client',
          clientId: client._id,
          active: true
        });
      } else {
        user.clientId = client._id;
        user.name = client.name;
        user.role = 'client';
        await user.save();
      }

      results.push({
        clientName: client.name,
        email,
        password: defaultPassword,
        clientId: client._id.toString()
      });
    }

    console.log(`\n✅ Successfully configured ${results.length} Client Accounts:`);
    console.table(results.map(r => ({ Name: r.clientName, Email: r.email, Password: r.password })));

    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating clients & users:', err);
    process.exit(1);
  }
}

createClientsAndUsers();

require('dotenv').config();
const mongoose = require('mongoose');

async function cleanDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in .env');
    process.exit(1);
  }
  try {
    console.log('Connecting to MongoDB Atlas to clean database...');
    await mongoose.connect(uri);
    console.log('Connected to host:', mongoose.connection.host);

    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      console.log(`Dropping collection: ${collection.collectionName}`);
      await collection.drop();
    }

    console.log('✅ Database cleaned successfully! All collections have been removed.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Clean DB Error:', err.message);
    process.exit(1);
  }
}

cleanDB();

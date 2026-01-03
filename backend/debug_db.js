const mongoose = require('mongoose');
require('dotenv').config();

const run = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');
        const db = mongoose.connection;

        // Check Restaurants
        const restaurants = await db.collection('restaurants').find({}).toArray();
        console.log(`\nTotal Restaurants found: ${restaurants.length}`);
        restaurants.forEach(r => {
            console.log(`Restaurant: "${r.restaurantName}" (ID: ${r._id})`);
        });

        // Check Users
        const users = await db.collection('users').find({}).toArray();
        console.log(`\nTotal Users found: ${users.length}`);

        mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

run();
